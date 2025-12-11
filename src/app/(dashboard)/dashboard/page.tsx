"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
    FileText,
    Clock,
    CheckCircle,
    AlertCircle,
    Sun,
} from "lucide-react";

export default function DashboardPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [greeting, setGreeting] = useState("Good Morning");
    const [headerClass, setHeaderClass] = useState("bg-gradient-to-r from-emerald-100 via-emerald-200 to-emerald-100 text-emerald-900");
    const [iconColor, setIconColor] = useState("text-emerald-600");

    useEffect(() => {
        // Update time every minute
        const timer = setInterval(() => setCurrentDate(new Date()), 60000);

        const hour = new Date().getHours();
        if (hour < 12) {
            setGreeting("Good Morning");
            setHeaderClass("bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg");
            setIconColor("text-emerald-100");
        } else if (hour < 17) {
            setGreeting("Good Afternoon");
            setHeaderClass("bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg");
            setIconColor("text-blue-100");
        } else {
            setGreeting("Good Evening");
            setHeaderClass("bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-lg");
            setIconColor("text-violet-100");
        }

        return () => clearInterval(timer);
    }, []);

    // Format Date: "Thursday, December 11, 2025"
    const formattedDate = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(currentDate);

    // Format Time: "12:56 PM"
    const formattedTime = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
    }).format(currentDate);

    return (
        <div className="space-y-4">
            {/* Dynamic Header Banner - Compact */}
            <div className={`rounded-lg p-3 shadow-sm flex flex-col md:flex-row items-center justify-between ${headerClass}`}>
                <div className="flex items-center gap-3">
                    <Sun className={`h-5 w-5 ${iconColor}`} />
                    <div>
                        <h2 className="text-lg font-bold tracking-tight leading-none">{greeting}, Mark Anderson</h2>
                        <p className="text-xs opacity-90 mt-0.5">Here is what's happening today.</p>
                    </div>
                </div>
                <div className="mt-2 md:mt-0 text-right">
                    <p className="font-semibold text-sm leading-none">{formattedTime}</p>
                    <p className="text-xs opacity-90">{formattedDate}</p>
                </div>
            </div>

            {/* Stats Grid - Micro Compact */}
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">

                {/* Total Documents */}
                <Card className="border-l-2 border-l-emerald-500 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-2.5">
                        <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded bg-emerald-50 flex items-center justify-center shrink-0">
                                <FileText className="h-3.5 w-3.5 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 leading-tight">Total Docs</p>
                                <div className="flex items-baseline gap-1.5">
                                    <h3 className="text-lg font-bold text-slate-900 leading-none">1,284</h3>
                                    <span className="text-[9px] text-emerald-600 font-medium">+180 new</span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Pending Review */}
                <Card className="border-l-2 border-l-amber-500 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-2.5">
                        <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded bg-amber-50 flex items-center justify-center shrink-0">
                                <Clock className="h-3.5 w-3.5 text-amber-600" />
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 leading-tight">Pending</p>
                                <div className="flex items-baseline gap-1.5">
                                    <h3 className="text-lg font-bold text-slate-900 leading-none">12</h3>
                                    <span className="text-[9px] text-amber-600 font-medium">3 urgent</span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Approved Today */}
                <Card className="border-l-2 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-2.5">
                        <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded bg-blue-50 flex items-center justify-center shrink-0">
                                <CheckCircle className="h-3.5 w-3.5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 leading-tight">Approved</p>
                                <div className="flex items-baseline gap-1.5">
                                    <h3 className="text-lg font-bold text-slate-900 leading-none">24</h3>
                                    <span className="text-[9px] text-blue-600 font-medium">98% rate</span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Rejected */}
                <Card className="border-l-2 border-l-red-500 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-2.5">
                        <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded bg-red-50 flex items-center justify-center shrink-0">
                                <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 leading-tight">Rejected</p>
                                <div className="flex items-baseline gap-1.5">
                                    <h3 className="text-lg font-bold text-slate-900 leading-none">3</h3>
                                    <span className="text-[9px] text-red-600 font-medium">Action needed</span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Activity Section - Compact */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4 border-slate-200 shadow-sm">
                    <CardContent className="p-4">
                        <div className="flex flex-col space-y-3">
                            <h3 className="font-semibold text-sm text-slate-800">Recent Documents</h3>
                            <div className="space-y-2">
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <div key={i} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0 hover:bg-slate-50 p-1.5 rounded transition-colors cursor-pointer">
                                        <div className="flex items-center space-x-3">
                                            <div className="h-8 w-8 rounded bg-blue-50 flex items-center justify-center text-blue-600">
                                                <FileText size={14} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-medium text-slate-900">Internal_Memo_Q4.pdf</p>
                                                <p className="text-[10px] text-slate-500">Sarah Smith • 2h ago</p>
                                            </div>
                                        </div>
                                        <div className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Pending</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="col-span-3 border-slate-200 shadow-sm">
                    <CardContent className="p-4">
                        <div className="flex flex-col space-y-3">
                            <h3 className="font-semibold text-sm text-slate-800">My Task Queue</h3>
                            <div className="space-y-2">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="flex items-start space-x-2.5 p-2 border border-slate-100 rounded bg-slate-50/50 hover:bg-white hover:shadow-sm transition-all cursor-pointer">
                                        <Clock className="h-4 w-4 text-blue-500 mt-0.5" />
                                        <div>
                                            <p className="text-xs font-medium text-slate-900">Review HR Policy Update</p>
                                            <p className="text-[10px] text-slate-500 mt-0.5">
                                                Assigned by <strong>Admin</strong>. Due tomorrow.
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
