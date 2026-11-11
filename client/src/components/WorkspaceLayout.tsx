import React from 'react';

interface WorkspaceLayoutProps {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  metadata?: React.ReactNode;
}

export function WorkspaceLayout({ sidebar, main, metadata }: WorkspaceLayoutProps) {
  return (
    <div className="flex h-[calc(100vh-64px)] gap-4 p-4">
      <div className="w-80 flex-shrink-0 overflow-y-auto">
        {sidebar}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {main}
      </div>

      {metadata && (
        <div className="w-72 flex-shrink-0 overflow-y-auto hidden lg:block">
          {metadata}
        </div>
      )}
    </div>
  );
}
