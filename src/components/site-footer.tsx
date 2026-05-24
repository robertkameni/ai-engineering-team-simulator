export function SiteFooter() {
  return (
    <footer className="glass-panel flex h-25 shrink-0 items-center justify-center border-t border-glass-border py-8 text-center">
      <p className="text-caption text-muted-foreground">
        © RK - Consulting {new Date().getFullYear()}
      </p>
    </footer>
  );
}
