import type { DatabaseSchema } from "../db.js";
import { demoLinkedRecords, isKnownDemoRecord } from "../demo.js";
export function provenance(data: DatabaseSchema) {
  const collections = ["jobs","applications","resumes","coverLetters","interviews","logs"] as const;
  type Kind = typeof collections[number];
  const linked = demoLinkedRecords(data);
  const nodes = new Map<string, { kind: Kind; id: string; present: boolean; root: boolean; linked: boolean }>();
  const key = (kind: Kind, id: unknown) => typeof id === "string" && id.trim() ? JSON.stringify([kind,id]) : undefined;
  const ensure = (kind: Kind, id: unknown) => {
    const k = key(kind,id); if (!k) return;
    if (!nodes.has(k)) nodes.set(k,{kind,id:id as string,present:false,root:false,linked:linked[kind].has(id as string)});
    return k;
  };
  for (const kind of collections) for (const row of data[kind]) {
    const k = ensure(kind,row.id); if (!k) continue;
    const node = nodes.get(k)!; node.present=true;
    node.root=!!row.isDemo || (["jobs","applications","interviews","logs"].includes(kind) && isKnownDemoRecord(kind as "jobs",row));
  }
  const edges: [Kind,string,Kind,string][]=[];
  const link = (a: Kind,idA: unknown,b: Kind,idB: unknown) => { if(ensure(a,idA)&&ensure(b,idB)) edges.push([a,idA as string,b,idB as string]); };
  for(const j of data.jobs){link("jobs",j.id,"resumes",j.processing?.resumeId);link("jobs",j.id,"coverLetters",j.processing?.coverLetterId);}
  for(const a of data.applications){link("applications",a.id,"jobs",a.jobId);link("applications",a.id,"resumes",a.tailoredResumeId);link("applications",a.id,"coverLetters",a.coverLetterId);}
  for(const kind of ["resumes","coverLetters"] as const) for(const d of data[kind])link(kind,d.id,"jobs",d.jobId);
  for(const i of data.interviews)link("interviews",i.id,"applications",i.applicationId);
  for(const l of data.logs)link("logs",l.id,"jobs",l.jobId);
  return {nodes:[...nodes.values()],edges};
}
