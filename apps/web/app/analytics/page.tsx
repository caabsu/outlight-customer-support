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
  sla: {
    within2Hours: number;
    within8Hours: number;
    within24Hours: number;
    sampleSize: number;
  };
  customerMetrics: {
    totalUniqueCustomers: number;
    multiMessageConversations: number;
    avgMessagesPerConversation: number;
  };
  volumeTrends: {
    [key: string]: {
      inbound: number;
      outbound: number;
      total: number;
      newConversations: number;
      resolved: number;
    };
  };
  tagDistribution: {
    [key: string]: number;
  };
  hourlyDistribution: {
    [hour: string]: number;
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

  const getStatusColor = (value: number, type: "response" | "resolution" | "sla") => {
    if (type === "response") {
      // Response time - lower is better
      if (value < 2) return "text-success"; // < 2 hours
      if (value < 8) return "text-warning"; // < 8 hours
      return "text-destructive"; // > 8 hours
    } else if (type === "sla") {
      // SLA percentage - higher is better
      if (value >= 80) return "text-success";
      if (value >= 50) return "text-warning";
      return "text-destructive";
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
  const graphWidth = 1000;
  const graphHeight = 320;
  const graphPadding = { top: 20, right: 20, bottom: 50, left: 60 };
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
  const newConvValues = volumeData.map(([_, v]) => v.newConversations);

  // Hourly distribution data
  const hourlyData = data.hourlyDistribution
    ? Object.entries(data.hourlyDistribution).map(([hour, count]) => ({
        hour: parseInt(hour),
        count: count as number
      })).sort((a, b) => a.hour - b.hour)
    : [];
  const maxHourlyVolume = hourlyData.length > 0
    ? Math.max(...hourlyData.map(h => h.count), 1)
    : 1;

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
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-[1600px] mx-auto p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-10">
            <div>
              <h1 className="text-4xl font-sans font-bold text-foreground mb-2">Customer Support Analytics</h1>
              <p className="text-base font-sans text-muted-foreground">
                Performance metrics for the last {data.periodInDays} days
              </p>
            </div>

            {/* Period Selector */}
            <div className="flex gap-2 bg-secondary border border-border rounded-lg p-1">
              {(["24h", "7d", "30d", "90d"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    period === p
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  {p === "24h" ? "24h" : p === "7d" ? "7d" : p === "30d" ? "30d" : "90d"}
                </button>
              ))}
            </div>
          </div>

          {/* Key Metrics Overview */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4 uppercase tracking-wide text-muted-foreground">Key Metrics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Conversations */}
              <div className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Total Tickets</h3>
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-primary">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                    </svg>
                  </div>
                </div>
                <p className="text-3xl font-bold text-foreground mb-1">{data.overview.totalConversations}</p>
                <p className="text-xs text-muted-foreground">{data.overview.totalMessages} messages</p>
              </div>

              {/* Needs Reply */}
              <div className="bg-card border border-border rounded-lg p-6 hover:border-warning/50 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Needs Reply</h3>
                  <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-warning">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                  </div>
                </div>
                <p className="text-3xl font-bold text-warning mb-1">{data.overview.unrepliedCount}</p>
                <p className="text-xs text-muted-foreground">
                  {data.overview.totalConversations > 0
                    ? Math.round((data.overview.unrepliedCount / data.overview.totalConversations) * 100)
                    : 0}% of total tickets
                </p>
              </div>

              {/* Resolved */}
              <div className="bg-card border border-border rounded-lg p-6 hover:border-success/50 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Resolved</h3>
                  <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-success">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                  </div>
                </div>
                <p className={`text-3xl font-bold mb-1 ${getStatusColor(data.overview.resolutionRate, "resolution")}`}>
                  {data.overview.resolvedCount}
                </p>
                <p className="text-xs text-muted-foreground">{data.overview.resolutionRate}% resolution rate</p>
              </div>

              {/* Unique Customers */}
              <div className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Unique Customers</h3>
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-primary">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                    </svg>
                  </div>
                </div>
                <p className="text-3xl font-bold text-foreground mb-1">{data.customerMetrics.totalUniqueCustomers}</p>
                <p className="text-xs text-muted-foreground">
                  {data.customerMetrics.avgMessagesPerConversation} avg msgs/ticket
                </p>
              </div>
            </div>
          </div>

          {/* SLA Performance */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4 uppercase tracking-wide text-muted-foreground">SLA Performance</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-card border border-border rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Within 2 Hours</h3>
                  <span className={`text-2xl font-bold ${getStatusColor(data.sla.within2Hours, "sla")}`}>
                    {data.sla.within2Hours}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5">
                  <div
                    className="bg-success rounded-full h-2.5 transition-all duration-500"
                    style={{ width: `${Math.min(data.sla.within2Hours, 100)}%` }}
                  />
                </div>
              </div>

              <div className="bg-card border border-border rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Within 8 Hours</h3>
                  <span className={`text-2xl font-bold ${getStatusColor(data.sla.within8Hours, "sla")}`}>
                    {data.sla.within8Hours}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5">
                  <div
                    className="bg-warning rounded-full h-2.5 transition-all duration-500"
                    style={{ width: `${Math.min(data.sla.within8Hours, 100)}%` }}
                  />
                </div>
              </div>

              <div className="bg-card border border-border rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Within 24 Hours</h3>
                  <span className={`text-2xl font-bold ${getStatusColor(data.sla.within24Hours, "sla")}`}>
                    {data.sla.within24Hours}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5">
                  <div
                    className="bg-primary rounded-full h-2.5 transition-all duration-500"
                    style={{ width: `${Math.min(data.sla.within24Hours, 100)}%` }}
                  />
                </div>
              </div>
            </div>
            {data.sla.sampleSize > 0 && (
              <p className="text-xs text-muted-foreground mt-3 text-center">
                Based on {data.sla.sampleSize} response{data.sla.sampleSize !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Response Time Metrics */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4 uppercase tracking-wide text-muted-foreground">Response Time</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">Average Response Time</h3>
                <p className={`text-4xl font-bold mb-2 ${getStatusColor(data.responseTime.averageHours, "response")}`}>
                  {formatHours(data.responseTime.averageHours)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Based on {data.responseTime.sampleSize} responses
                </p>
              </div>

              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">Median Response Time</h3>
                <p className={`text-4xl font-bold mb-2 ${getStatusColor(data.responseTime.medianHours, "response")}`}>
                  {formatHours(data.responseTime.medianHours)}
                </p>
                <p className="text-xs text-muted-foreground">50th percentile</p>
              </div>

              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">First Response Time</h3>
                <p className={`text-4xl font-bold mb-2 ${getStatusColor(data.responseTime.firstResponseAverageHours, "response")}`}>
                  {formatHours(data.responseTime.firstResponseAverageHours)}
                </p>
                <p className="text-xs text-muted-foreground">Time to initial reply</p>
              </div>
            </div>
          </div>

          {/* Email Volume & Velocity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Daily Volume</h3>
              <p className="text-3xl font-bold text-primary mb-2">{data.emailVelocity.total}</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>↓ {data.emailVelocity.inbound} inbound/day</p>
                <p>↑ {data.emailVelocity.outbound} outbound/day</p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Inbound Messages</h3>
              <p className="text-3xl font-bold text-warning mb-2">{data.overview.inboundMessages}</p>
              <div className="w-full bg-muted rounded-full h-2 mt-3">
                <div
                  className="bg-warning rounded-full h-2 transition-all duration-500"
                  style={{
                    width: `${data.overview.totalMessages > 0 ? (data.overview.inboundMessages / data.overview.totalMessages) * 100 : 0}%`
                  }}
                />
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Outbound Messages</h3>
              <p className="text-3xl font-bold text-success mb-2">{data.overview.outboundMessages}</p>
              <div className="w-full bg-muted rounded-full h-2 mt-3">
                <div
                  className="bg-success rounded-full h-2 transition-all duration-500"
                  style={{
                    width: `${data.overview.totalMessages > 0 ? (data.overview.outboundMessages / data.overview.totalMessages) * 100 : 0}%`
                  }}
                />
              </div>
            </div>
          </div>

          {/* Volume Trends Graph */}
          <div className="bg-card border border-border rounded-lg p-6 mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-6 uppercase tracking-wide text-muted-foreground">
              Daily Volume Trends
            </h2>
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

                  {/* X-axis labels - show fewer labels for clarity */}
                  {volumeData.map(([date], index) => {
                    // Only show every nth label depending on data length
                    const showEvery = volumeData.length > 30 ? 7 : volumeData.length > 14 ? 3 : 1;
                    if (index % showEvery !== 0 && index !== volumeData.length - 1) return null;

                    const xStep = chartWidth / Math.max(volumeData.length - 1, 1);
                    const x = graphPadding.left + index * xStep;
                    const displayDate = new Date(date).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric'
                    });
                    return (
                      <text
                        key={date}
                        x={x}
                        y={graphHeight - graphPadding.bottom + 25}
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
                      className="fill-primary/5"
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
                    />
                  )}

                  {outboundValues.length > 0 && (
                    <polyline
                      points={getPoints(outboundValues)}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-success"
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
                        r="3"
                        className="fill-primary stroke-background"
                        strokeWidth="2"
                      />
                    );
                  })}
                </svg>

                {/* Legend */}
                <div className="flex items-center justify-center gap-6 mt-6">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-1 bg-primary rounded"></div>
                    <span className="text-sm text-muted-foreground">Total</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-1 bg-warning rounded"></div>
                    <span className="text-sm text-muted-foreground">Inbound</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-1 bg-success rounded"></div>
                    <span className="text-sm text-muted-foreground">Outbound</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-12 text-base">No data available for this period</p>
            )}
          </div>

          {/* Hourly Workload Distribution */}
          {hourlyData.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-6 mb-8">
              <h2 className="text-lg font-semibold text-foreground mb-6 uppercase tracking-wide text-muted-foreground">
                Hourly Workload Distribution
              </h2>
              <div className="grid grid-cols-12 gap-1">
                {hourlyData.map(({ hour, count }) => {
                  const height = maxHourlyVolume > 0 ? (count / maxHourlyVolume) * 100 : 0;
                  return (
                    <div key={hour} className="flex flex-col items-center gap-2">
                      <div className="w-full h-32 bg-muted rounded-sm flex items-end overflow-hidden">
                        <div
                          className="w-full bg-primary/70 hover:bg-primary transition-all"
                          style={{ height: `${height}%` }}
                          title={`${hour}:00 - ${count} emails`}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{hour}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-4 text-center">
                Inbound email distribution by hour of day (based on {data.overview.inboundMessages} messages)
              </p>
            </div>
          )}

          {/* Tag Distribution & Customer Engagement */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Tag Distribution */}
            {Object.keys(data.tagDistribution).length > 0 && (
              <div className="bg-card border border-border rounded-lg p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4 uppercase tracking-wide text-muted-foreground">
                  Tag Distribution
                </h2>
                <div className="space-y-3">
                  {Object.entries(data.tagDistribution)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 8)
                    .map(([tag, count]) => (
                      <div key={tag} className="flex items-center justify-between">
                        <span className="text-sm text-foreground truncate flex-1">{tag}</span>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="w-24 bg-muted rounded-full h-2">
                            <div
                              className="bg-primary rounded-full h-2 transition-all duration-500"
                              style={{
                                width: `${(count / data.overview.totalConversations) * 100}%`
                              }}
                            />
                          </div>
                          <span className="text-sm font-semibold text-foreground w-8 text-right">{count}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Customer Engagement */}
            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4 uppercase tracking-wide text-muted-foreground">
                Customer Engagement
              </h2>
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Multi-Message Conversations</p>
                    <p className="text-2xl font-bold text-foreground">
                      {data.customerMetrics.multiMessageConversations}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground mb-1">Percentage</p>
                    <p className="text-2xl font-bold text-primary">
                      {data.overview.totalConversations > 0
                        ? Math.round((data.customerMetrics.multiMessageConversations / data.overview.totalConversations) * 100)
                        : 0}%
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Avg Messages per Ticket</p>
                    <p className="text-2xl font-bold text-foreground">
                      {data.customerMetrics.avgMessagesPerConversation}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground mb-1">Non-Support</p>
                    <p className="text-2xl font-bold text-red-500">
                      {data.overview.nonCustomerSupportCount}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
