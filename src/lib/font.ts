import { Rubik } from "next/font/google";

// The site's one font, served by the app itself. Shared by the root layout and the global
// error page, which replaces the layout and so declares its own <html>.
export const rubik = Rubik({ subsets: ["hebrew", "latin", "latin-ext", "cyrillic"], variable: "--font-rubik" });
