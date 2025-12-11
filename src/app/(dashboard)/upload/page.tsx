import { DocumentUploadForm } from "@/components/forms/document-upload-form";

export default function UploadPage() {
    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Upload Document</h2>
                <p className="text-slate-500">
                    Digitize a new record or upload an existing file to the system.
                </p>
            </div>

            <DocumentUploadForm />
        </div>
    );
}
