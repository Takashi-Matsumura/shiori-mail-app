import { InboxIcon } from "@/components/icons";

export default function MailboxIndex() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
      <span className="flex size-14 items-center justify-center rounded-full border border-line bg-panel [&_svg]:size-6">
        <InboxIcon />
      </span>
      <p>一覧からメールを選ぶと、ここに表示されます。</p>
    </div>
  );
}
