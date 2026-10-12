import { PageHeader } from "@/components/ui";
import { SettingsNav } from "@/components/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" description="Teach it what a good startup looks like, choose where it looks, and check that everything is running." />
      <SettingsNav />
      {children}
    </>
  );
}
