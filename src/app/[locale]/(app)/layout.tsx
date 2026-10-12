import { Header } from "@/components/Header";
import { BottomNav } from "@/components/MainNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-6xl px-4 pt-2 pb-28 lg:px-12 lg:pt-8 lg:pb-12">
        {children}
      </main>
      <BottomNav />
    </>
  );
}
