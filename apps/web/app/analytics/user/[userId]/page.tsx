"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface UserAnalytics {
  userId: string;
  totalOutbound: number;
  emailsByDay: Record<string, number>;
  emailsByHour: Record<number, number>;
  assignedConversations: number;
  draftedConversations: number;
  timeRange: string;
}

interface User {
  id: string;
  name: string;
  username: string;
  role: string;
  email?: string;
}

export default function UserAnalyticsPage() {
  const params = useParams();
  const userId = params?.userId as string;
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("7d");

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  useEffect(() => {
    fetchUserData();
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, timeRange]);

  const fetchUserData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/user/${userId}`);
      const data = await response.json();
      setUser(data);
    } catch (error) {
      console.error("Error fetching user:", error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/analytics/user/${userId}?timeRange=${timeRange}`);
      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !user || !analytics) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const emailsByDayArray = Object.entries(analytics.emailsByDay || {}).sort((a, b) => a[0].localeCompare(b[0]));
  const emailsByHourArray = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: analytics.emailsByHour[hour] || 0,
  }));
  const maxHourly = Math.max(...emailsByHourArray.map(h => h.count), 1);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link href="/" className="text-3xl font-serif text-gray-900 hover:text-blue-600 transition-colors">
                outlight
              </Link>
              <p className="text-gray-600 mt-1 text-sm">User Analytics</p>
            </div>
            <Link
              href="/analytics"
              className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2"
            >
              View General Analytics
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* User Info Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-2xl font-bold text-blue-600">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
              <p className="text-gray-600">@{user.username} • {user.role}</p>
            </div>
            <div className="flex gap-2">
              {(["7d", "30d", "90d"] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setTimeRange(period)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    timeRange === period
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {period === "7d" ? "7 Days" : period === "30d" ? "30 Days" : "90 Days"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Total Emails Sent</h3>
            <p className="text-3xl font-bold text-blue-600">{analytics.totalOutbound}</p>
            <p className="text-xs text-gray-500 mt-1">Last {timeRange}</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Assigned Conversations</h3>
            <p className="text-3xl font-bold text-green-600">{analytics.assignedConversations}</p>
            <p className="text-xs text-gray-500 mt-1">Last {timeRange}</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Drafted Conversations</h3>
            <p className="text-3xl font-bold text-purple-600">{analytics.draftedConversations}</p>
            <p className="text-xs text-gray-500 mt-1">Last {timeRange}</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Daily Average</h3>
            <p className="text-3xl font-bold text-orange-600">
              {emailsByDayArray.length > 0
                ? Math.round(analytics.totalOutbound / emailsByDayArray.length)
                : 0}
            </p>
            <p className="text-xs text-gray-500 mt-1">Emails per day</p>
          </div>
        </div>

        {/* Emails by Day Chart */}
        {emailsByDayArray.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Daily Email Activity</h2>
            <div className="space-y-3">
              {emailsByDayArray.map(([date, count]) => {
                const maxCount = Math.max(...emailsByDayArray.map(([_, c]) => c), 1);
                const percentage = (count / maxCount) * 100;
                return (
                  <div key={date} className="flex items-center gap-4">
                    <span className="text-sm text-gray-600 w-24">
                      {new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-8 overflow-hidden">
                      <div
                        className="bg-blue-600 h-full flex items-center px-3 transition-all duration-500"
                        style={{ width: `${Math.max(percentage, 5)}%` }}
                      >
                        <span className="text-sm font-medium text-white">{count}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Hourly Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Hourly Activity Distribution</h2>
          <div className="grid grid-cols-24 gap-1">
            {emailsByHourArray.map(({ hour, count }) => {
              const height = maxHourly > 0 ? (count / maxHourly) * 100 : 0;
              return (
                <div key={hour} className="flex flex-col items-center gap-2">
                  <div className="w-full h-32 bg-gray-100 rounded-sm flex items-end overflow-hidden relative group">
                    <div
                      className="w-full bg-blue-600 hover:bg-blue-700 transition-all relative"
                      style={{ height: `${Math.max(height, 2)}%` }}
                      title={`${hour}:00 - ${count} emails`}
                    >
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        {count} emails
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-gray-600">{hour}</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-4 text-center">
            Email activity by hour of day (last {timeRange})
          </p>
        </div>
      </div>
    </div>
  );
}
