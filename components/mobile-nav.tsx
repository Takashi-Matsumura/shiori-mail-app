import { AiInsights } from "@/components/ai-insights";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { SyncButton } from "@/components/sync-button";
import { getAccount } from "@/lib/accounts";
import { countDrafts } from "@/lib/drafts";
import { getCounts } from "@/lib/queries";

/** スマホ幅で出す画面下のタブ。左パネルにある同期と、右パネルの栞の働きは「メニュー」のシートに入れる。 */
export async function MobileNav() {
  const account = getAccount();
  const counts = account ? await getCounts(account.id) : null;
  const drafts = account ? await countDrafts() : 0;
  return (
    <MobileTabBar unread={counts?.unread ?? 0} drafts={drafts}>
      {account ? <SyncButton /> : null}
      <div className="-mx-4 border-t border-line pt-4">
        <AiInsights />
      </div>
    </MobileTabBar>
  );
}
