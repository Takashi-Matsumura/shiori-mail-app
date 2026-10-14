import { Suspense } from "react";
import { AiInsights } from "@/components/ai-insights";
import { AiRail } from "@/components/ai-rail";
import { AppHeader } from "@/components/app-header";
import { IdleLock } from "@/components/idle-lock";
import { SidePanel } from "@/components/side-panel";
import { Sidebar } from "@/components/sidebar";
import { SidebarRail } from "@/components/sidebar-rail";

/** ログイン後の画面の枠。ログイン画面にメールの情報を出さないよう、ルートのレイアウトから分けてある。 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <IdleLock />
      <AppHeader />
      <div className="flex min-h-0 flex-1">
        <SidePanel
          side="left"
          label="メニュー"
          rail={
            <Suspense fallback={null}>
              <SidebarRail />
            </Suspense>
          }
        >
          <Suspense fallback={null}>
            <Sidebar />
          </Suspense>
        </SidePanel>
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
        <SidePanel
          side="right"
          label="栞の働き"
          rail={
            <Suspense fallback={null}>
              <AiRail />
            </Suspense>
          }
        >
          <Suspense fallback={null}>
            <AiInsights />
          </Suspense>
        </SidePanel>
      </div>
    </>
  );
}
