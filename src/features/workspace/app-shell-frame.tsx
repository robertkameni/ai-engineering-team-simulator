interface AppShellFrameProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  artifacts?: React.ReactNode;
  mobileSlot?: React.ReactNode;
}

/** Server layout shell — responsive columns via CSS, no hydration. */
export function AppShellFrame({
  sidebar,
  children,
  artifacts,
  mobileSlot,
}: AppShellFrameProps) {
  return (
    <div className="@container/app-shell ambient-mesh relative flex h-svh flex-col overflow-hidden">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden min-[720px]:flex-row">
        {sidebar}
        <div className="@container/workspace-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
        {artifacts}
      </div>
      {mobileSlot}
    </div>
  );
}
