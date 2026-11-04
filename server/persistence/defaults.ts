import { randomUUID } from "node:crypto";
import { emptyProfile, initialSettings, type DatabaseSchema } from "../db.js";
import { DEFAULT_CONNECTORS } from "../demo.js";
export function cleanState(): DatabaseSchema {
  return { profile:{...emptyProfile(),revision:randomUUID()}, jobs:[],applications:[],resumes:[],coverLetters:[],interviews:[],logs:[],
    connectors:structuredClone(DEFAULT_CONNECTORS).map(c=>({...c,connectionStatus:"Not implemented",isConfigured:false,discoverySupport:false,applicationSupport:false,lastSuccessfulCheck:null,activeJobsFound:0})),
    settings:structuredClone(initialSettings),pauseEpoch:0,
    status:{isPaused:false,emergencyStop:false,workerState:"idle",lastCycleRun:"",nextScheduledRun:"",dailyApplicationsCount:0,dailyApplicationLimit:initialSettings.dailyApplicationLimit,totalJobsDiscoveredToday:0,activeConnectorsCount:0} };
}
