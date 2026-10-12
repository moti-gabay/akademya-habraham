import { Header } from "@/components/Header";

// The lesson screen on mobile is just "Back" and the video: no header, no bottom navigation.
export default function LessonLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header className="hidden lg:block" />
      {children}
    </>
  );
}
