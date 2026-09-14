import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, RequireAuth } from "@/auth/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardPage } from "@/pages/DashboardPage";
import { InboxPage } from "@/pages/InboxPage";
import { DocumentsPage } from "@/pages/DocumentsPage";
import { DocumentDetailPage } from "@/pages/DocumentDetailPage";
import { UploadPage } from "@/pages/UploadPage";
import { AuditPage } from "@/pages/AuditPage";
import { ReferenceDataPage } from "@/pages/admin/ReferenceDataPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { ToastProvider } from "@/components/ui/toast";

/**
 * Every route sits behind RequireAuth. There is no public area: sign-in happens on the
 * server, at the identity provider's own pages, and the SPA is only ever reached with a
 * session already established.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <RequireAuth>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="inbox" element={<InboxPage />} />
                <Route path="documents" element={<DocumentsPage />} />
                <Route path="documents/:id" element={<DocumentDetailPage />} />
                <Route path="upload" element={<UploadPage />} />
                <Route path="audit" element={<AuditPage />} />

                {/* One component, three routes — the lookup tables share a shape on the
                    server, so they share a screen here too. */}
                <Route
                  path="admin/departments"
                  element={
                    <ReferenceDataPage
                      resource="departments"
                      title="Departments"
                      description="Organisational units documents are routed to."
                      noun="Department"
                    />
                  }
                />
                <Route
                  path="admin/types"
                  element={
                    <ReferenceDataPage
                      resource="document-types"
                      title="Document types"
                      description="Categories a document can be filed under. May select its approval route."
                      noun="Document type"
                    />
                  }
                />
                <Route
                  path="admin/origins"
                  element={
                    <ReferenceDataPage
                      resource="origins"
                      title="Origins"
                      description="Where documents come from."
                      noun="Origin"
                    />
                  }
                />

                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </RequireAuth>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
