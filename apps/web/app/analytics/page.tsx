"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type AnalyticsData = {
  period: string;
  periodInDays: number;
  overview: {
    totalConversations: number;
    totalMessages: number;
    inboundMessages: number;
    outboundMessages: number;
    unrepliedCount: number;
    resolvedCount: number;
    resolutionRate: number;
  };
  emailVelocity: {
    total: number;
    inbound: number;
    outbound: number;
  };
  responseTime: {
    average: number;
    median: number;
    averageHours: number;
    medianHours: number;
    firstResponseAverage: number;
    firstResponseAverageHours: number;
    sampleSize: number;
  };
  volumeTrends: {
    [key: string]: {
      inbound: number;
      outbound: number;
      total: number;
    };
  };
  tagDistribution: {
    [key: string]: number;
  };
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"24h" | "7d" | "30d" | "90d">("7d");

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?period=${period}`);
      const analyticsData = await res.json();
      setData(analyticsData);
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatHours = (hours: number) => {
    if (hours < 1) {
      return `${Math.round(hours * 60)}m`;
    } else if (hours < 24) {
      return `${hours.toFixed(1)}h`;
    } else {
      const days = Math.floor(hours / 24);
      const remainingHours = Math.round(hours % 24);
      return `${days}d ${remainingHours}h`;
    }
  };

  const getStatusColor = (value: number, type: "response" | "resolution") => {
    if (type === "response") {
      // Response time - lower is better
      if (value < 2) return "text-success"; // < 2 hours
      if (value < 8) return "text-warning"; // < 8 hours
      return "text-destructive"; // > 8 hours
    } else {
      // Resolution rate - higher is better
      if (value >= 80) return "text-success"; // >= 80%
      if (value >= 50) return "text-warning"; // >= 50%
      return "text-destructive"; // < 50%
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Failed to load analytics</p>
      </div>
    );
  }

  // Prepare volume trend chart data
  const volumeData = Object.entries(data.volumeTrends).sort((a, b) => a[0].localeCompare(b[0]));
  const maxVolume = Math.max(...volumeData.map(([_, v]) => v.total));

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-background flex flex-col">
        <Link href="/" className="p-6 border-b border-border hover:bg-accent/30 transition-colors">
          <h1 className="text-xl font-semibold text-foreground">Outlight</h1>
          <p className="text-sm text-muted-foreground mt-1">Analytics</p>
        </Link>

        <nav className="flex-1 p-4 space-y-1">
          <Link
            href="/emails"
            className="block w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            Inbox
          </Link>
          <div className="w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium bg-accent text-accent-foreground">
            Analytics
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Analytics Dashboard</h1>
              <p className="text-muted-foreground">
                Viewing data for the last {data.periodInDays} days
              </p>
            </div>

            {/* Period Selector */}
            <div className="flex gap-2">
              {(["24h", "7d", "30d", "90d"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    period === p
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-accent"
                  }`}
                >
                  {p === "24h" ? "24 Hours" : p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : "90 Days"}
                </button>
              ))}
            </div>
          </div>

          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Total Conversations */}
            <div className="bg-secondary border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">Total Conversations</h3>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-5 h-5 text-primary"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                    />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-bold text-foreground mb-1">{data.overview.totalConversations}</p>
              <p className="text-xs text-muted-foreground">{data.overview.totalMessages} total messages</p>
            </div>

            {/* Needs Reply */}
            <div className="bg-secondary border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">Needs Reply</h3>
                <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-5 h-5 text-warning"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-bold text-warning mb-1">{data.overview.unrepliedCount}</p>
              <p className="text-xs text-muted-foreground">
                {data.overview.totalConversations > 0
                  ? Math.round((data.overview.unrepliedCount / data.overview.totalConversations) * 100)
                  : 0}
                % of total
              </p>
            </div>

            {/* Resolved */}
            <div className="bg-secondary border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">Resolved</h3>
                <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-5 h-5 text-success"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    />
                  </svg>
                </div>
              </div>
              <p className={`text-3xl font-bold mb-1 ${getStatusColor(data.overview.resolutionRate, "resolution")}`}>
                {data.overview.resolvedCount}
              </p>
              <p className="text-xs text-muted-foreground">{data.overview.resolutionRate}% resolution rate</p>
            </div>

            {/* Email Velocity */}
            <div className="bg-secondary border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">Email Velocity</h3>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-5 h-5 text-primary"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
                    />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-bold text-foreground mb-1">{data.emailVelocity.total}</p>
              <p className="text-xs text-muted-foreground">
                emails/day ({data.emailVelocity.inbound} in, {data.emailVelocity.outbound} out)
              </p>
            </div>
          </div>

          {/* Response Time Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Average Response Time */}
            <div className="bg-secondary border border-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Average Response Time</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-end gap-2 mb-1">
                    <p className={`text-4xl font-bold ${getStatusColor(data.responseTime.averageHours, "response")}`}>
                      {formatHours(data.responseTime.averageHours)}
                    </p>
                    <p className="text-sm text-muted-foreground mb-2">average</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Based on {data.responseTime.sampleSize} responses</p>
                </div>

                <div className="pt-4 border-t border-border">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-muted-foreground">Median Response Time</span>
                    <span className={`text-lg font-bold ${getStatusColor(data.responseTime.medianHours, "response")}`}>
                      {formatHours(data.responseTime.medianHours)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">First Response Time</span>
                    <span className={`text-lg font-bold ${getStatusColor(data.responseTime.firstResponseAverageHours, "response")}`}>
                      {formatHours(data.responseTime.firstResponseAverageHours)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Volume Breakdown */}
            <div className="bg-secondary border border-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Volume Breakdown</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-muted-foreground">Inbound Messages</span>
                    <span className="text-lg font-bold text-primary">{data.overview.inboundMessages}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary rounded-full h-2"
                      style={{
                        width: `${data.overview.totalMessages > 0 ? (data.overview.inboundMessages / data.overview.totalMessages) * 100 : 0}%`
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-muted-foreground">Outbound Messages</span>
                    <span className="text-lg font-bold text-success">{data.overview.outboundMessages}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-success rounded-full h-2"
                      style={{
                        width: `${data.overview.totalMessages > 0 ? (data.overview.outboundMessages / data.overview.totalMessages) * 100 : 0}%`
                      }}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-border">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Messages</span>
                    <span className="text-2xl font-bold text-foreground">{data.overview.totalMessages}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Volume Trends Chart */}
          <div className="bg-secondary border border-border rounded-xl p-6 mb-8">
            <h3 className="text-lg font-semibold text-foreground mb-4">Volume Trends</h3>
            {volumeData.length > 0 ? (
              <div className="space-y-3">
                {volumeData.map(([date, volume]) => (
                  <div key={date} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{new Date(date).toLocaleDateString()}</span>
                      <span className="text-foreground font-medium">{volume.total} emails</span>
                    </div>
                    <div className="flex gap-1 h-8">
                      <div
                        className="bg-primary rounded flex items-center justify-center text-xs text-primary-foreground font-medium"
                        style={{ width: `${maxVolume > 0 ? (volume.inbound / maxVolume) * 100 : 0}%`, minWidth: volume.inbound > 0 ? '30px' : '0' }}
                      >
                        {volume.inbound > 0 && volume.inbound}
                      </div>
                      <div
                        className="bg-success rounded flex items-center justify-center text-xs text-white font-medium"
                        style={{ width: `${maxVolume > 0 ? (volume.outbound / maxVolume) * 100 : 0}%`, minWidth: volume.outbound > 0 ? '30px' : '0' }}
                      >
                        {volume.outbound > 0 && volume.outbound}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No data available for this period</p>
            )}
          </div>

          {/* Tag Distribution */}
          {Object.keys(data.tagDistribution).length > 0 && (
            <div className="bg-secondary border border-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Tag Distribution</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Object.entries(data.tagDistribution)
                  .sort((a, b) => b[1] - a[1])
                  .map(([tag, count]) => (
                    <div key={tag} className="bg-background border border-border rounded-lg p-4">
                      <p className="text-xs text-muted-foreground mb-1 truncate">{tag}</p>
                      <p className="text-2xl font-bold text-primary">{count}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
