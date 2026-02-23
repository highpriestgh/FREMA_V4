"use client";

import { CheckCircle2, Circle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkflowStage = "submitted" | "gatekeeper" | "department" | "completed";

const stages: { key: WorkflowStage; label: string; description: string }[] = [
    { key: "submitted", label: "Submitted", description: "Document received" },
    { key: "gatekeeper", label: "Gatekeeper", description: "Initial screening" },
    { key: "department", label: "Department", description: "Departmental review" },
    { key: "completed", label: "Completed", description: "Final decision made" },
];

type StepStatus = "completed" | "current" | "upcoming";

function getStepStatus(stageKey: WorkflowStage, currentStage: WorkflowStage): StepStatus {
    const order: WorkflowStage[] = ["submitted", "gatekeeper", "department", "completed"];
    const stepIndex = order.indexOf(stageKey);
    const currentIndex = order.indexOf(currentStage);
    if (stepIndex < currentIndex) return "completed";
    if (stepIndex === currentIndex) return "current";
    return "upcoming";
}

interface WorkflowStepperProps {
    currentStage: WorkflowStage;
}

export function WorkflowStepper({ currentStage }: WorkflowStepperProps) {
    return (
        <div className="w-full">
            <ol className="flex items-start w-full">
                {stages.map((stage, index) => {
                    const status = getStepStatus(stage.key, currentStage);
                    const isLast = index === stages.length - 1;

                    return (
                        <li key={stage.key} className={cn("flex items-center", !isLast && "flex-1")}>
                            <div className="flex flex-col items-center">
                                {/* Icon */}
                                <div className={cn(
                                    "flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors",
                                    status === "completed" && "bg-blue-600 border-blue-600",
                                    status === "current" && "bg-white border-blue-600",
                                    status === "upcoming" && "bg-white border-slate-300"
                                )}>
                                    {status === "completed" && (
                                        <CheckCircle2 className="h-4 w-4 text-white" />
                                    )}
                                    {status === "current" && (
                                        <Clock className="h-4 w-4 text-blue-600" />
                                    )}
                                    {status === "upcoming" && (
                                        <Circle className="h-4 w-4 text-slate-300" />
                                    )}
                                </div>
                                {/* Label */}
                                <div className="mt-2 text-center min-w-[60px]">
                                    <p className={cn(
                                        "text-xs font-semibold",
                                        status === "completed" && "text-blue-600",
                                        status === "current" && "text-blue-600",
                                        status === "upcoming" && "text-slate-400"
                                    )}>{stage.label}</p>
                                    <p className="text-[10px] text-slate-400 hidden sm:block">{stage.description}</p>
                                </div>
                            </div>
                            {/* Connector line */}
                            {!isLast && (
                                <div className={cn(
                                    "flex-1 h-0.5 mx-2 mt-[-20px]",
                                    status === "completed" ? "bg-blue-600" : "bg-slate-200"
                                )} />
                            )}
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
