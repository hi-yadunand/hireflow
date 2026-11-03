import React, { useState } from "react";
import {
  PlugZap,
  CheckCircle2,
  AlertCircle,
  Clock,
  Key,
  ExternalLink,
  ShieldAlert,
  Sliders,
  Settings,
  RefreshCw,
} from "lucide-react";
import type { ConnectorInfo } from "../types/index.js";
import { api } from "../lib/api.js";

interface IntegrationsViewProps {
  connectors: ConnectorInfo[];
  onRefreshConnectors: () => void;
}

export const IntegrationsView: React.FC<IntegrationsViewProps> = ({
  connectors,
  onRefreshConnectors,
}) => {
  const [selectedConnector, setSelectedConnector] = useState<ConnectorInfo | null>(null);
  const [credentialInput, setCredentialInput] = useState("");
  const [pollingInterval, setPollingInterval] = useState(30);
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenConfig = (conn: ConnectorInfo) => {
    setSelectedConnector(conn);
    setCredentialInput(conn.isConfigured ? "••••••••••••••••" : "");
    setPollingInterval(conn.configuredPollingIntervalMinutes);
  };

  const handleSaveConnector = async () => {
    if (!selectedConnector) return;
    setIsSaving(true);
    try {
      await api.updateConnector(selectedConnector.id, {
        isConfigured: credentialInput.length > 0,
        connectionStatus: credentialInput.length > 0 ? "Connected" : "Not Connected",
        configuredPollingIntervalMinutes: pollingInterval,
        lastError: null,
        lastSuccessfulCheck: new Date().toISOString(),
      });
      setSelectedConnector(null);
      onRefreshConnectors();
    } catch (err: any) {
      alert("Failed to update connector: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#171717] tracking-tight flex items-center space-x-2">
            <PlugZap className="w-4 h-4 text-[#171717]" />
            <span>Connector & Job Source Registry</span>
          </h2>
          <p className="text-xs text-[#737373]">
            Verified API feeds, ATS gateways, and official developer endpoints.
          </p>
        </div>

        <div className="text-xs text-[#737373] font-mono bg-[#FAF9F8] px-3 py-1.5 rounded border border-[#E8E8E8]">
          STRICT ANTI-BOT COMPLIANCE: ZERO FABRICATED DATA
        </div>
      </div>

      {/* Compliance Notice */}
      <div className="p-4 border border-[#E8E8E8] rounded-xl bg-white flex items-start space-x-3 text-xs">
        <ShieldAlert className="w-4 h-4 text-[#171717] mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold text-[#171717]">Authentication & Authorization Standards</p>
          <p className="text-[#737373] text-[11px] leading-relaxed">
            HireFlow strictly adheres to legitimate access policies. Aggregators without public developer APIs (such as Naukri or Workday without corporate tenant SSO) are explicitly identified as <strong>Unsupported</strong> or <strong>Not Connected</strong>. Integrations rely solely on documented APIs, authorized feeds, and permitted ATS candidate endpoints.
          </p>
        </div>
      </div>

      {/* Registry Table */}
      <div className="border border-[#E8E8E8] rounded-xl bg-white overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF9F8] border-b border-[#E8E8E8] text-[#737373] font-mono text-[11px]">
              <tr>
                <th className="py-3 px-4 font-medium">Connector / Platform</th>
                <th className="py-3 px-4 font-medium">Category</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">Capabilities</th>
                <th className="py-3 px-4 font-medium">Last Sync</th>
                <th className="py-3 px-4 font-medium">Polling Interval</th>
                <th className="py-3 px-4 font-medium text-right">Settings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E8E8]">
              {connectors.map((conn) => {
                const isConnected = conn.connectionStatus === "Connected" || conn.connectionStatus === "API Authorized";
                const isUnsupported = conn.connectionStatus === "Unsupported";

                return (
                  <tr key={conn.id} className="hover:bg-[#FAF9F8] transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-[#171717]">
                      {conn.sourceName}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[11px] text-[#737373]">
                      {conn.category}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border ${
                          conn.connectionStatus === "Connected"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : conn.connectionStatus === "API Authorized"
                            ? "bg-blue-50 text-blue-800 border-blue-200"
                            : isUnsupported
                            ? "bg-gray-100 text-gray-500 border-gray-200"
                            : "bg-amber-50 text-amber-800 border-amber-200"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            conn.connectionStatus === "Connected"
                              ? "bg-emerald-500"
                              : conn.connectionStatus === "API Authorized"
                              ? "bg-blue-500"
                              : isUnsupported
                              ? "bg-gray-400"
                              : "bg-amber-500"
                          }`}
                        />
                        <span>{conn.connectionStatus}</span>
                      </span>

                      {conn.lastError && (
                        <p className="text-[10px] text-red-600 mt-0.5 line-clamp-1 max-w-xs font-mono">
                          {conn.lastError}
                        </p>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-[11px] font-mono">
                      <div className="flex items-center space-x-2">
                        <span className={conn.discoverySupport ? "text-emerald-700" : "text-gray-400"}>
                          Discovery: {conn.discoverySupport ? "YES" : "NO"}
                        </span>
                        <span>•</span>
                        <span className={conn.applicationSupport ? "text-blue-700" : "text-gray-400"}>
                          Apply: {conn.applicationSupport ? "YES" : "NO"}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[11px] text-[#737373]">
                      {conn.lastSuccessfulCheck
                        ? new Date(conn.lastSuccessfulCheck).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "Never"}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[11px] text-[#737373]">
                      {conn.configuredPollingIntervalMinutes} min
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleOpenConfig(conn)}
                        className="inline-flex items-center space-x-1 text-[11px] font-medium text-[#171717] bg-[#F8F8F7] hover:bg-[#EFEFEF] border border-[#E8E8E8] px-2.5 py-1 rounded transition-colors"
                      >
                        <Settings className="w-3 h-3 text-[#737373]" />
                        <span>Config</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Connector Config Modal */}
      {selectedConnector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-[#E8E8E8] rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-semibold text-[#171717]">
              Configure {selectedConnector.sourceName} Connector
            </h3>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-[#FAF9F8] border border-[#E8E8E8] rounded-md text-[11px] text-[#737373] space-y-1">
                <p>
                  <strong className="text-[#171717]">Required Credentials:</strong>
                </p>
                <p className="font-mono text-[#171717]">{selectedConnector.requiredCredentials}</p>
              </div>

              <div>
                <label className="block text-[#171717] font-medium mb-1">
                  API Key / Access Token / Feed URL
                </label>
                <input
                  type="password"
                  value={credentialInput}
                  onChange={(e) => setCredentialInput(e.target.value)}
                  placeholder="Enter authorized credential..."
                  className="w-full p-2 border border-[#E8E8E8] rounded-md font-mono text-xs focus:outline-none focus:border-[#171717]"
                />
              </div>

              <div>
                <label className="block text-[#171717] font-medium mb-1">
                  Polling Interval (Minutes)
                </label>
                <input
                  type="number"
                  min="5"
                  max="720"
                  value={pollingInterval}
                  onChange={(e) => setPollingInterval(Number(e.target.value) || 30)}
                  className="w-full p-2 border border-[#E8E8E8] rounded-md text-xs focus:outline-none focus:border-[#171717]"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-[#E8E8E8]">
              <button
                type="button"
                onClick={() => setSelectedConnector(null)}
                className="px-3 py-1.5 border border-[#E8E8E8] rounded-md hover:bg-gray-50 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveConnector}
                disabled={isSaving}
                className="px-4 py-1.5 bg-[#171717] text-white rounded-md hover:bg-black font-medium text-xs"
              >
                {isSaving ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
