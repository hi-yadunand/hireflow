import { randomUUID } from "node:crypto";
import { Database, type DatabaseSchema } from "../db.js";
import { processingCheckpoint } from "../processing-policy.js";
import { SafetyError } from "../validation.js";
import { cleanState } from "./defaults.js";
import { databaseError } from "./config.js";
import type { SqlClient, SqlPool } from "./pool.js";
import { synchronous, type Command, type CycleLease, type Repository, type WriteOptions } from "./repository.js";
import { provenance } from "./provenance.js";

const SNAPSHOT = `SELECT c.initialized, c.fence::text, statement_timestamp() AS now,
  l.token, l.expires_at > statement_timestamp() AS cycle_live,
  jsonb_build_object(
    'profile',p.payload,'settings',s.payload,
    'legacyProfile',(SELECT payload FROM hireflow.profile_snapshots WHERE kind='legacy'),
    'pauseEpoch',c.pause_epoch,'status',c.status || jsonb_build_object('isPaused',c.paused,'emergencyStop',c.paused),
    'lastManualCycleAt',c.last_manual_cycle_at,
    'jobs',COALESCE((SELECT jsonb_agg(payload ORDER BY sort_order DESC) FROM hireflow.jobs WHERE deleted_at IS NULL),'[]'),
    'applications',COALESCE((SELECT jsonb_agg(a.payload || jsonb_build_object('timeline',COALESCE((SELECT jsonb_agg(e.payload ORDER BY e.position) FROM hireflow.application_events e WHERE e.application_id=a.id),'[]')) ORDER BY a.sort_order DESC) FROM hireflow.applications a),'[]'),
    'resumes',COALESCE((SELECT jsonb_agg(payload ORDER BY sort_order DESC) FROM hireflow.resumes),'[]'),
    'coverLetters',COALESCE((SELECT jsonb_agg(payload ORDER BY sort_order DESC) FROM hireflow.cover_letters),'[]'),
    'interviews',COALESCE((SELECT jsonb_agg(payload ORDER BY sort_order DESC) FROM hireflow.interviews),'[]'),
    'connectors',COALESCE((SELECT jsonb_agg(payload ORDER BY sort_order DESC) FROM hireflow.connector_configs),'[]'),
    'logs',COALESCE((SELECT jsonb_agg(payload ORDER BY sort_order DESC) FROM hireflow.agent_logs),'[]'),
    'stagingLedger',jsonb_build_object('day',to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD'),'jobIds',COALESCE((SELECT jsonb_agg(job_id ORDER BY job_id) FROM hireflow.staging_usage WHERE utc_day=(statement_timestamp() AT TIME ZONE 'UTC')::date),'[]'))
  ) AS data,
  COALESCE((SELECT jsonb_agg(jsonb_build_array(token,jsonb_build_object('jobId',job_id,'day',utc_day::text))) FROM hireflow.staging_reservations WHERE state='held' AND expires_at>statement_timestamp() AND utc_day=(statement_timestamp() AT TIME ZONE 'UTC')::date),'[]') AS reservations
FROM hireflow.agent_controls c LEFT JOIN hireflow.profiles p ON p.singleton=c.singleton
LEFT JOIN hireflow.app_settings s ON s.singleton=c.singleton LEFT JOIN hireflow.cycle_leases l ON l.singleton=c.singleton`;
const equal = (a: unknown,b: unknown) => JSON.stringify(a)===JSON.stringify(b);
const json = (value: unknown) => JSON.stringify(value);

export class PostgresRepository implements Repository {
  private listeners = new Map<() => void, number | undefined>();
  private poll?: ReturnType<typeof setInterval>;
  private polling = false;
  constructor(readonly pool: SqlPool) {}

  private async transaction<T>(write: boolean, work: (client: SqlClient) => Promise<T>): Promise<T> {
    let client: SqlClient | undefined, began=false, broken=false;
    try {
      client=await this.pool.connect();
      await client.query(write ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began=true;
      await client.query("SET LOCAL lock_timeout = '2s'");
      if(write) await client.query("SELECT singleton FROM hireflow.agent_controls WHERE singleton=true FOR UPDATE");
      const result=await work(client);
      await client.query("COMMIT"); return result;
    } catch(error) {
      if(client&&began) try {await client.query("ROLLBACK");} catch {broken=true;}
      throw databaseError(error);
    } finally {client?.release(broken);}
  }
  async verifyReady() {
    try {
      await this.transaction(false,async c=>{
        const r=await c.query("SELECT initialized FROM hireflow.agent_controls WHERE singleton=true");
        if(!r.rows[0]?.initialized) throw new SafetyError("PostgreSQL is not initialized. Run npm run db:migrate.",503);
      });
    } catch(error) { if(error instanceof SafetyError && error.message.includes("not initialized"))throw error; throw new SafetyError("PostgreSQL schema is unavailable. Run npm run db:migrate and check database access.",503); }
  }
  // Called only by the explicitly invoked migration command, never as a fallback.
  async initialize() {
    await this.transaction(true,async c=>{
      const r=await c.query("SELECT initialized FROM hireflow.agent_controls WHERE singleton=true");
      if(r.rows[0]?.initialized)return;
      const count=await c.query(`SELECT (SELECT count(*) FROM hireflow.profiles)+(SELECT count(*) FROM hireflow.jobs)+(SELECT count(*) FROM hireflow.applications)+(SELECT count(*) FROM hireflow.resumes)+(SELECT count(*) FROM hireflow.cover_letters)+(SELECT count(*) FROM hireflow.interviews)+(SELECT count(*) FROM hireflow.agent_logs)+(SELECT count(*) FROM hireflow.connector_configs)+(SELECT count(*) FROM hireflow.app_settings) AS count`);
      if(Number(count.rows[0]?.count)!==0)throw new SafetyError("Clean initialization refused: existing HireFlow records were found.",409);
      await this.flush(c,undefined,cleanState(),[],[]);
      await c.query("INSERT INTO hireflow.initialization_metadata(singleton,mode,schema_version) VALUES(true,'clean',1)");
      await c.query("UPDATE hireflow.agent_controls SET initialized=true WHERE singleton=true");
    });
  }
  private async load(c: SqlClient) {
    const r=await c.query(SNAPSHOT), row=r.rows[0];
    if(!row?.initialized)throw new SafetyError("PostgreSQL is not initialized. Run npm run db:migrate.",503);
    const data=row.data as DatabaseSchema;
    if(!row.cycle_live && !data.status.isPaused)data.status.workerState="idle";
    if(data.legacyProfile===null)delete data.legacyProfile;
    if(data.lastManualCycleAt===null)delete data.lastManualCycleAt;
    const reservations=row.reservations as [string,{jobId:string;day:string}][];
    const state=Database.memory(data,reservations,()=>new Date(row.now));
    return {state,data,reservations};
  }
  async read<T>(command: Command<T>) {
    return this.transaction(false,async c=>{
      const {state,data,reservations}=await this.load(c);
      const result=synchronous(command(state));
      if(!equal(data,state.snapshot())||!equal(reservations,state.stageReservations()))throw new SafetyError("Read-only repository command attempted a mutation",500);
      return result;
    });
  }
  async write<T>(command: Command<T>,options: WriteOptions={}) {
    let pausedEpoch: number | undefined;
    const result=await this.transaction(true,async c=>{
      await this.expire(c);
      if(options.lease)await this.assertLease(c,options.lease);
      if(options.signal?.aborted)throw new SafetyError("Request cancelled; no result was saved",409);
      const {state,data,reservations}=await this.load(c);
      const result=synchronous(command(state)),after=state.snapshot();
      await this.flush(c,data,after,reservations,state.stageReservations(),options.lease);
      if(options.lease)await this.assertLease(c,options.lease);
      if(options.signal?.aborted)throw new SafetyError("Request cancelled; no result was saved",409);
      if(after.pauseEpoch!==data.pauseEpoch)pausedEpoch=after.pauseEpoch;
      return result;
    });
    if(pausedEpoch!==undefined)for(const [listener,epoch]of [...this.listeners])if(epoch!==pausedEpoch)listener();
    return result;
  }
  private async expire(c: SqlClient) {
    await c.query("UPDATE hireflow.staging_reservations SET state='expired' WHERE state='held' AND (expires_at<=clock_timestamp() OR utc_day<>(clock_timestamp() AT TIME ZONE 'UTC')::date OR (cycle_token IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hireflow.cycle_leases l WHERE l.token=cycle_token AND l.expires_at>clock_timestamp())))");
  }
  private async assertLease(c: SqlClient,lease: CycleLease) {
    const r=await c.query(`SELECT 1 FROM hireflow.cycle_leases l JOIN hireflow.agent_controls c USING(singleton)
      WHERE l.token=$1 AND l.fence=$2::bigint AND c.fence=$2::bigint AND c.pause_epoch=$3::bigint AND NOT c.paused AND l.expires_at>clock_timestamp()`,[lease.token,lease.fence,lease.epoch]);
    if(!r.rows.length)throw new SafetyError("Processing lease expired or was interrupted; retry the cycle",409,{code:"AI_CANCELLED"});
  }
  async acquireCycle(): Promise<CycleLease> {
    return this.transaction(true,async c=>{
      const {state}=await this.load(c);processingCheckpoint(state);
      const held=await c.query("SELECT 1 FROM hireflow.cycle_leases WHERE token IS NOT NULL AND expires_at>clock_timestamp()");
      if(held.rows.length)throw new SafetyError("A processing cycle is already running",409);
      const r=await c.query("UPDATE hireflow.agent_controls SET fence=fence+1 WHERE singleton=true RETURNING fence::text");
      const lease={token:randomUUID(),fence:r.rows[0].fence,epoch:state.getPauseEpoch()};
      await c.query("UPDATE hireflow.cycle_leases SET token=$1,fence=$2::bigint,expires_at=clock_timestamp()+interval '90 seconds' WHERE singleton=true",[lease.token,lease.fence]);
      return lease;
    });
  }
  async renewCycle(lease: CycleLease) {
    await this.transaction(true,async c=>{
      await this.assertLease(c,lease);
      await c.query("UPDATE hireflow.cycle_leases SET expires_at=clock_timestamp()+interval '90 seconds' WHERE token=$1",[lease.token]);
      await c.query("UPDATE hireflow.staging_reservations SET expires_at=clock_timestamp()+interval '90 seconds' WHERE state='held' AND cycle_token=$1",[lease.token]);
    });
  }
  async finishCycle(lease: CycleLease) {
    await this.transaction(true,async c=>{
      await c.query("UPDATE hireflow.staging_reservations SET state='released' WHERE state='held' AND cycle_token=$1",[lease.token]);
      const r=await c.query("UPDATE hireflow.cycle_leases SET token=NULL,expires_at=NULL WHERE token=$1 AND fence=$2::bigint RETURNING singleton",[lease.token,lease.fence]);
      if(r.rows.length)await c.query("UPDATE hireflow.agent_controls SET last_manual_cycle_at=$1,status=status || jsonb_build_object('workerState',CASE WHEN paused THEN 'paused' ELSE 'idle' END) WHERE singleton=true",[new Date().toISOString()]);
    });
  }
  onPause(listener:()=>void,epoch?:number) {
    this.listeners.set(listener,epoch);
    if(!this.poll)this.poll=setInterval(()=>{void this.pollControls();},250);
    return ()=>{this.listeners.delete(listener);if(!this.listeners.size&&this.poll){clearInterval(this.poll);this.poll=undefined;}};
  }
  private async pollControls() {
    if(this.polling||!this.listeners.size)return;this.polling=true;
    let client:SqlClient|undefined;
    try {
      client=await this.pool.connect();const r=await client.query("SELECT paused,pause_epoch::text FROM hireflow.agent_controls WHERE singleton=true");
      if(!r.rows[0])throw new Error("Control state unavailable");
      for(const [listener,epoch]of [...this.listeners])if(r.rows[0].paused||(epoch!==undefined&&String(epoch)!==r.rows[0].pause_epoch))listener();
    }catch{console.error("HireFlow could not verify pause controls; in-flight AI operations cancelled.");for(const listener of [...this.listeners.keys()])listener();}
    finally{client?.release();this.polling=false;}
  }
  async close(){if(this.poll)clearInterval(this.poll);for(const listener of [...this.listeners.keys()])listener();this.listeners.clear();await this.pool.end();}

  private async flush(c:SqlClient,before:DatabaseSchema|undefined,after:DatabaseSchema,oldReservations:[string,{jobId:string;day:string}][],reservations:[string,{jobId:string;day:string}][],lease?:CycleLease) {
    if(!before||!equal(before.profile,after.profile)) {
      await c.query("INSERT INTO hireflow.profiles(singleton,revision,payload) VALUES(true,$1,$2::jsonb) ON CONFLICT(singleton) DO UPDATE SET revision=EXCLUDED.revision,payload=EXCLUDED.payload",[after.profile.revision||Database.memory(after).profileVersion(),json(after.profile)]);
      await c.query("INSERT INTO hireflow.profile_snapshots(revision,kind,payload) VALUES($1,'revision',$2::jsonb) ON CONFLICT(revision) DO NOTHING",[after.profile.revision||Database.memory(after).profileVersion(),json(after.profile)]);
    }
    if(after.legacyProfile&&!before?.legacyProfile) await c.query("INSERT INTO hireflow.profile_snapshots(revision,kind,payload) VALUES($1,'legacy',$2::jsonb)",[randomUUID(),json(after.legacyProfile)]);
    if(!before||!equal(before.settings,after.settings))await c.query("INSERT INTO hireflow.app_settings(singleton,payload,daily_limit,match_threshold) VALUES(true,$1::jsonb,$2,$3) ON CONFLICT(singleton) DO UPDATE SET payload=EXCLUDED.payload,daily_limit=EXCLUDED.daily_limit,match_threshold=EXCLUDED.match_threshold",[json(after.settings),after.settings.dailyApplicationLimit,after.settings.matchThreshold]);
    const paused=!!(after.settings.emergencyPause||after.status.isPaused);
    if(!before||!equal(before.status,after.status)||before.pauseEpoch!==after.pauseEpoch||before.lastManualCycleAt!==after.lastManualCycleAt)await c.query("UPDATE hireflow.agent_controls SET paused=$1,pause_epoch=$2,status=$3::jsonb,last_manual_cycle_at=$4 WHERE singleton=true",[paused,after.pauseEpoch||0,json(after.status),after.lastManualCycleAt||null]);
    if(before&&before.pauseEpoch!==after.pauseEpoch) {
      await c.query("UPDATE hireflow.agent_controls SET fence=fence+1 WHERE singleton=true");
      await c.query("UPDATE hireflow.cycle_leases SET token=NULL,expires_at=NULL WHERE singleton=true");
      await c.query("UPDATE hireflow.staging_reservations SET state='released' WHERE state='held'");
      // Do not recreate the snapshot's now-revoked reservations below.
      reservations=[];
    }
    const changed=async<K extends "jobs"|"resumes"|"coverLetters"|"applications"|"interviews"|"connectors"|"logs">(kind:K,save:(row:DatabaseSchema[K][number],old:DatabaseSchema[K][number]|undefined)=>Promise<void>)=>{
      const old=new Map((before?.[kind]||[]).map(row=>[row.id,row]));
      for(const row of [...after[kind]].reverse())if(!equal(old.get(row.id),row))await save(row,old.get(row.id));
    };
    await changed("jobs",async j=>{const result=await c.query("INSERT INTO hireflow.jobs(id,payload,source,workplace_type,match_score,application_status) VALUES($1,$2::jsonb,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,source=EXCLUDED.source,workplace_type=EXCLUDED.workplace_type,match_score=EXCLUDED.match_score,application_status=EXCLUDED.application_status WHERE hireflow.jobs.deleted_at IS NULL RETURNING id",[j.id,json(j),j.source,j.workplaceType,j.matchPercentage,j.applicationStatus]);if(!result.rows.length)throw new SafetyError("A deleted job already uses this ID. Use a new ID instead.",409);});
    for(const j of before?.jobs||[])if(!after.jobs.some(x=>x.id===j.id))await c.query("UPDATE hireflow.jobs SET deleted_at=clock_timestamp() WHERE id=$1",[j.id]);
    const jobIds=new Set(after.jobs.map(j=>j.id));
    for(const [kind,table]of [["resumes","resumes"],["coverLetters","cover_letters"]]as const)await changed(kind,async d=>{await c.query(`INSERT INTO hireflow.${table}(id,job_id,original_job_id,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,job_id=EXCLUDED.job_id,original_job_id=EXCLUDED.original_job_id`,[d.id,jobIds.has(d.jobId)?d.jobId:null,d.jobId,json(d)]);});
    await changed("applications",async(a,old)=>{
      const prior=old?.timeline||[];
      if(a.timeline.length<prior.length||!equal(a.timeline.slice(0,prior.length),prior))throw new SafetyError("Application history cannot be replaced",409);
      const {timeline,...payload}=a;
      await c.query("INSERT INTO hireflow.applications(id,job_id,resume_id,cover_letter_id,status,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(id) DO UPDATE SET resume_id=EXCLUDED.resume_id,cover_letter_id=EXCLUDED.cover_letter_id,status=EXCLUDED.status,payload=EXCLUDED.payload",[a.id,a.jobId,a.tailoredResumeId||null,a.coverLetterId||null,a.status,json(payload)]);
      for(let i=prior.length;i<timeline.length;i++)await c.query("INSERT INTO hireflow.application_events(application_id,position,payload) VALUES($1,$2,$3::jsonb)",[a.id,i,json(timeline[i])]);
    });
    const appIds=new Set(after.applications.map(a=>a.id));
    await changed("interviews",async i=>{await c.query("INSERT INTO hireflow.interviews(id,application_id,original_application_id,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(id) DO UPDATE SET application_id=EXCLUDED.application_id,original_application_id=EXCLUDED.original_application_id,payload=EXCLUDED.payload",[i.id,i.applicationId&&appIds.has(i.applicationId)?i.applicationId:null,i.applicationId||null,json(i)]);});
    await changed("connectors",async x=>{await c.query("INSERT INTO hireflow.connector_configs(id,payload,polling_minutes) VALUES($1,$2::jsonb,$3) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,polling_minutes=EXCLUDED.polling_minutes",[x.id,json(x),x.configuredPollingIntervalMinutes]);});
    await changed("logs",async l=>{await c.query("INSERT INTO hireflow.agent_logs(id,job_id,original_job_id,payload) VALUES($1,$2,$3,$4::jsonb)",[l.id,l.jobId&&jobIds.has(l.jobId)?l.jobId:null,l.jobId||null,json(l)]);});
    for(const [token,r]of oldReservations)if(!reservations.some(([key])=>key===token))await c.query("UPDATE hireflow.staging_reservations SET state=$2 WHERE token=$1 AND state='held'",[token,after.applications.some(a=>a.jobId===r.jobId&&a.stagedAt)?"consumed":"released"]);
    for(const [token,r]of reservations)if(!oldReservations.some(([key])=>key===token))await c.query("INSERT INTO hireflow.staging_reservations(token,job_id,utc_day,cycle_token,expires_at,state) VALUES($1,$2,$3::date,$4,clock_timestamp()+interval '90 seconds','held')",[token,r.jobId,r.day,lease?.token||null]);
    if(after.stagingLedger)for(const id of after.stagingLedger.jobIds)if(before?.stagingLedger?.day!==after.stagingLedger.day||!before.stagingLedger.jobIds.includes(id)){
      const app=after.applications.find(a=>a.jobId===id&&a.stagedAt);
      if(!app)throw new SafetyError("Staging usage requires a staged application",409);
      await c.query("INSERT INTO hireflow.staging_usage(utc_day,job_id,application_id) VALUES($1::date,$2,$3) ON CONFLICT(utc_day,job_id) DO NOTHING",[after.stagingLedger.day,id,app.id]);
    }
    if(!before||["jobs","applications","resumes","coverLetters","interviews","logs"].some(k=>!equal(before[k as keyof DatabaseSchema],after[k as keyof DatabaseSchema]))) {
      const graph=provenance(after);
      for(const n of graph.nodes)await c.query("INSERT INTO hireflow.provenance_nodes(kind,external_id,record_present,demo_root,demo_linked) VALUES($1,$2,$3,$4,$5) ON CONFLICT(kind,external_id) DO UPDATE SET record_present=EXCLUDED.record_present,demo_root=EXCLUDED.demo_root,demo_linked=EXCLUDED.demo_linked",[n.kind,n.id,n.present,n.root,n.linked]);
      for(const edge of graph.edges)await c.query("INSERT INTO hireflow.provenance_edges(from_kind,from_id,to_kind,to_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",edge);
    }
  }
}
