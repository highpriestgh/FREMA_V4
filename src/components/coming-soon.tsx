import { Construction } from "lucide-react";

export default function ComingSoon({ title }: { title: string }) {
    return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-slate-500">
            <Construction className="h-16 w-16 mb-4 text-slate-300" />
            <h2 className="text-2xl font-bold text-slate-700">{title}</h2>
            <p>This module is currently under development.</p>
        </div>
    );
}
