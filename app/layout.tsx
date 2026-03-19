import "./globals.css";

export const metadata = {
  title: "Wake Window Estimator",
  description: "Track and forecast your baby’s wake windows.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
