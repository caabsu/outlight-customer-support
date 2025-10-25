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
    totalConversationsIncludingNonSupport: number;
    nonCustomerSupportCount: number;
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

  useEffect(() => {
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

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
        <p className="text-muted-foreground text-lg">Loading analytics...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-lg">Failed to load analytics</p>
      </div>
    );
  }

  // Prepare volume trend chart data
  const volumeData = Object.entries(data.volumeTrends).sort((a, b) => a[0].localeCompare(b[0]));
  const maxVolume = Math.max(...volumeData.map(([_, v]) => v.total), 1);

  // Graph dimensions
  const graphWidth = 800;
  const graphHeight = 300;
  const graphPadding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = graphWidth - graphPadding.left - graphPadding.right;
  const chartHeight = graphHeight - graphPadding.top - graphPadding.bottom;

  // Calculate points for the line graph
  const getPoints = (values: number[]) => {
    if (values.length === 0) return "";
    const xStep = chartWidth / Math.max(values.length - 1, 1);
    return values
      .map((value, index) => {
        const x = graphPadding.left + index * xStep;
        const y = graphPadding.top + chartHeight - (value / maxVolume) * chartHeight;
        return `${x},${y}`;
      })
      .join(" ");
  };

  const totalValues = volumeData.map(([_, v]) => v.total);
  const inboundValues = volumeData.map(([_, v]) => v.inbound);
  const outboundValues = volumeData.map(([_, v]) => v.outbound);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-background flex flex-col">
        <Link href="/" className="p-6 border-b border-border hover:bg-accent/30 transition-colors">
          <h1 className="text-2xl font-serif text-foreground">outlight</h1>
          <p className="text-sm font-sans text-muted-foreground mt-1">Customer Support</p>
        </Link>

        <nav className="flex-1 p-4 space-y-2">
          {/* Email Section */}
          <div className="mb-4">
            <div className="px-4 py-2 mb-2">
              <h3 className="text-xs font-sans font-semibold text-muted-foreground uppercase tracking-wider">Email</h3>
            </div>
            <Link
              href="/emails"
              className="block w-full text-left px-4 py-2.5 rounded-lg text-sm font-sans font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-transparent"></span>
              Inbox
            </Link>
          </div>

          {/* Analytics Section */}
          <div className="pt-4 border-t border-border">
            <div className="px-4 py-2 mb-2">
              <h3 className="text-xs font-sans font-semibold text-muted-foreground uppercase tracking-wider">Insights</h3>
            </div>
            <div className="w-full text-left px-4 py-2.5 rounded-lg text-sm font-sans font-medium bg-accent text-accent-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-warning"></span>
              Analytics
            </div>
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-12">
          {/* Header */}
          <div className="flex items-center justify-between mb-12">
            <div>
              <h1 className="text-4xl font-sans font-bold text-foreground mb-3">Analytics Dashboard</h1>
              <p className="text-lg font-sans text-muted-foreground">
                Viewing data for the last {data.periodInDays} days
              </p>
            </div>

            {/* Period Selector */}
            <div className="flex gap-2">
              {(["24h", "7d", "30d", "90d"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {/* Total Conversations */}
            <div className="bg-secondary border border-border rounded-xl p-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total Conversations</h3>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-6 h-6 text-primary"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                    />
                  </svg>
                </div>
              </div>
              <p className="text-4xl font-bold text-foreground mb-2">{data.overview.totalConversations}</p>
              <p className="text-sm text-muted-foreground">{data.overview.totalMessages} total messages</p>
            </div>

            {/* Needs Reply */}
            <div className="bg-secondary border border-border rounded-xl p-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Needs Reply</h3>
                <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-6 h-6 text-warning"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    />
                  </svg>
                </div>
              </div>
              <p className="text-4xl font-bold text-warning mb-2">{data.overview.unrepliedCount}</p>
              <p className="text-sm text-muted-foreground">
                {data.overview.totalConversations > 0
                  ? Math.round((data.overview.unrepliedCount / data.overview.totalConversations) * 100)
                  : 0}
                % of total
              </p>
            </div>

            {/* Resolved */}
            <div className="bg-secondary border border-border rounded-xl p-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Resolved</h3>
                <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-6 h-6 text-success"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    />
                  </svg>
                </div>
              </div>
              <p className={`text-4xl font-bold mb-2 ${getStatusColor(data.overview.resolutionRate, "resolution")}`}>
                {data.overview.resolvedCount}
              </p>
              <p className="text-sm text-muted-foreground">{data.overview.resolutionRate}% resolution rate</p>
            </div>

            {/* Email Velocity */}
            <div className="bg-secondary border border-border rounded-xl p-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Email Velocity</h3>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-6 h-6 text-primary"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
                    />
                  </svg>
                </div>
              </div>
              <p className="text-4xl font-bold text-foreground mb-2">{data.emailVelocity.total}</p>
              <p className="text-sm text-muted-foreground">
                emails/day ({data.emailVelocity.inbound} in, {data.emailVelocity.outbound} out)
              </p>
            </div>
          </div>

          {/* Additional Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
            {/* Total Emails (Including Non-Support) */}
            <div className="bg-secondary border border-border rounded-xl p-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total Emails</h3>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-6 h-6 text-primary"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                    />
                  </svg>
                </div>
              </div>
              <p className="text-4xl font-bold text-foreground mb-2">{data.overview.totalConversationsIncludingNonSupport}</p>
              <p className="text-sm text-muted-foreground">
                All conversations (including {data.overview.nonCustomerSupportCount} non-support)
              </p>
            </div>

            {/* Non-Customer Support Count */}
            <div className="bg-secondary border border-border rounded-xl p-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Non-Customer Support</h3>
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-6 h-6 text-red-500"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
                    />
                  </svg>
                </div>
              </div>
              <p className="text-4xl font-bold text-red-500 mb-2">{data.overview.nonCustomerSupportCount}</p>
              <p className="text-sm text-muted-foreground">
                {data.overview.totalConversationsIncludingNonSupport > 0
                  ? Math.round((data.overview.nonCustomerSupportCount / data.overview.totalConversationsIncludingNonSupport) * 100)
                  : 0}
                % of total emails
              </p>
            </div>
          </div>

          {/* Volume Trends Graph */}
          <div className="bg-secondary border border-border rounded-xl p-8 mb-16">
            <h2 className="text-2xl font-sans font-bold text-foreground mb-6">Email Volume Trends</h2>
            {volumeData.length > 0 ? (
              <div className="w-full overflow-x-auto">
                <svg width={graphWidth} height={graphHeight} className="mx-auto">
                  {/* Grid lines */}
                  {[0, 1, 2, 3, 4].map((i) => {
                    const y = graphPadding.top + (chartHeight / 4) * i;
                    const value = Math.round(maxVolume - (maxVolume / 4) * i);
                    return (
                      <g key={i}>
                        <line
                          x1={graphPadding.left}
                          y1={y}
                          x2={graphWidth - graphPadding.right}
                          y2={y}
                          stroke="currentColor"
                          strokeWidth="1"
                          className="text-border"
                          strokeDasharray="4 4"
                        />
                        <text
                          x={graphPadding.left - 10}
                          y={y + 4}
                          textAnchor="end"
                          className="text-xs fill-muted-foreground"
                        >
                          {value}
                        </text>
                      </g>
                    );
                  })}

                  {/* X-axis labels */}
                  {volumeData.map(([date], index) => {
                    const xStep = chartWidth / Math.max(volumeData.length - 1, 1);
                    const x = graphPadding.left + index * xStep;
                    const displayDate = new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    return (
                      <text
                        key={date}
                        x={x}
                        y={graphHeight - graphPadding.bottom + 20}
                        textAnchor="middle"
                        className="text-xs fill-muted-foreground"
                      >
                        {displayDate}
                      </text>
                    );
                  })}

                  {/* Area fill for total */}
                  {totalValues.length > 0 && (
                    <polygon
                      points={`${graphPadding.left},${graphPadding.top + chartHeight} ${getPoints(totalValues)} ${graphWidth - graphPadding.right},${graphPadding.top + chartHeight}`}
                      className="fill-primary/10"
                    />
                  )}

                  {/* Lines */}
                  {totalValues.length > 0 && (
                    <polyline
                      points={getPoints(totalValues)}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      className="text-primary"
                    />
                  )}

                  {inboundValues.length > 0 && (
                    <polyline
                      points={getPoints(inboundValues)}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-warning"
                      strokeDasharray="5 5"
                    />
                  )}

                  {outboundValues.length > 0 && (
                    <polyline
                      points={getPoints(outboundValues)}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-success"
                      strokeDasharray="5 5"
                    />
                  )}

                  {/* Data points */}
                  {totalValues.map((value, index) => {
                    const xStep = chartWidth / Math.max(totalValues.length - 1, 1);
                    const x = graphPadding.left + index * xStep;
                    const y = graphPadding.top + chartHeight - (value / maxVolume) * chartHeight;
                    return (
                      <circle
                        key={index}
                        cx={x}
                        cy={y}
                        r="4"
                        className="fill-primary stroke-background"
                        strokeWidth="2"
                      />
                    );
                  })}
                </svg>

                {/* Legend */}
                <div className="flex items-center justify-center gap-8 mt-6">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-1 bg-primary rounded"></div>
                    <span className="text-sm text-muted-foreground">Total</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-1 bg-warning rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, currentColor, currentColor 5px, transparent 5px, transparent 10px)' }}></div>
                    <span className="text-sm text-muted-foreground">Inbound</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-1 bg-success rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, currentColor, currentColor 5px, transparent 5px, transparent 10px)' }}></div>
                    <span className="text-sm text-muted-foreground">Outbound</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-12 text-lg">No data available for this period</p>
            )}
          </div>

          {/* Response Time Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
            {/* Average Response Time */}
            <div className="bg-secondary border border-border rounded-xl p-8">
              <h2 className="text-2xl font-sans font-bold text-foreground mb-6">Response Time Metrics</h2>
              <div className="space-y-6">
                <div>
                  <div className="flex items-end gap-3 mb-2">
                    <p className={`text-5xl font-bold ${getStatusColor(data.responseTime.averageHours, "response")}`}>
                      {formatHours(data.responseTime.averageHours)}
                    </p>
                    <p className="text-lg text-muted-foreground mb-3">average</p>
                  </div>
                  <p className="text-sm text-muted-foreground">Based on {data.responseTime.sampleSize} responses</p>
                </div>

                <div className="pt-6 border-t border-border space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-base text-muted-foreground">Median Response Time</span>
                    <span className={`text-2xl font-bold ${getStatusColor(data.responseTime.medianHours, "response")}`}>
                      {formatHours(data.responseTime.medianHours)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-base text-muted-foreground">First Response Time</span>
                    <span className={`text-2xl font-bold ${getStatusColor(data.responseTime.firstResponseAverageHours, "response")}`}>
                      {formatHours(data.responseTime.firstResponseAverageHours)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Volume Breakdown */}
            <div className="bg-secondary border border-border rounded-xl p-8">
              <h2 className="text-2xl font-sans font-bold text-foreground mb-6">Volume Breakdown</h2>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-base text-muted-foreground">Inbound Messages</span>
                    <span className="text-2xl font-bold text-primary">{data.overview.inboundMessages}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3">
                    <div
                      className="bg-primary rounded-full h-3 transition-all duration-500"
                      style={{
                        width: `${data.overview.totalMessages > 0 ? (data.overview.inboundMessages / data.overview.totalMessages) * 100 : 0}%`
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-base text-muted-foreground">Outbound Messages</span>
                    <span className="text-2xl font-bold text-success">{data.overview.outboundMessages}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3">
                    <div
                      className="bg-success rounded-full h-3 transition-all duration-500"
                      style={{
                        width: `${data.overview.totalMessages > 0 ? (data.overview.outboundMessages / data.overview.totalMessages) * 100 : 0}%`
                      }}
                    />
                  </div>
                </div>

                <div className="pt-6 border-t border-border">
                  <div className="flex justify-between items-center">
                    <span className="text-base text-muted-foreground">Total Messages</span>
                    <span className="text-3xl font-bold text-foreground">{data.overview.totalMessages}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tag Distribution */}
          {Object.keys(data.tagDistribution).length > 0 && (
            <div className="bg-secondary border border-border rounded-xl p-8 mb-16">
              <h2 className="text-2xl font-sans font-bold text-foreground mb-6">Tag Distribution</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {Object.entries(data.tagDistribution)
                  .sort((a, b) => b[1] - a[1])
                  .map(([tag, count]) => (
                    <div key={tag} className="bg-background border border-border rounded-lg p-6 hover:border-primary transition-colors">
                      <p className="text-sm text-muted-foreground mb-2 truncate">{tag}</p>
                      <p className="text-3xl font-bold text-primary">{count}</p>
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
