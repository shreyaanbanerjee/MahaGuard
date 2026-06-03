import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ taskId: string }> }): Promise<Metadata> {
  const { taskId } = await params;
  return {
    title: `Risk Scorecard — MahaGuard AI`,
    description: `AI-generated MahaRERA legal risk audit scorecard with citation verification.`,
  };
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
