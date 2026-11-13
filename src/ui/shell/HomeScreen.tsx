import { useState } from 'react';
import { appUnread, unreadLabel } from '../format';
import { S } from '../strings';
import type { AppDef, ChatThread, FolderDef } from '../types';
import { AppIcon } from './icons';

interface Props {
  apps: AppDef[];
  folders: FolderDef[];
  threads: ChatThread[];
  onOpen(appId: string): void;
}

function Badge({ count }: { count: number }) {
  const label = unreadLabel(count);
  if (!label) return null;
  return <span className="badge">{label}</span>;
}

export function HomeScreen({ apps, folders, threads, onOpen }: Props) {
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const grid = apps.filter((a) => !a.dock && !a.folder);
  const dock = apps.filter((a) => a.dock);
  const folder = folders.find((f) => f.id === openFolder);

  const tile = (app: AppDef) => (
    <button key={app.id} className="tile" onClick={() => onOpen(app.id)}>
      <span className="tile__icon">
        <AppIcon icon={app.icon} />
        <Badge count={appUnread(app, threads)} />
      </span>
      <span className="tile__name">{app.name}</span>
    </button>
  );

  return (
    <div className="home">
      <div className="home__grid">
        {grid.map(tile)}
        {folders.map((f) => {
          const inside = apps.filter((a) => a.folder === f.id);
          const count = inside.reduce((n, a) => n + appUnread(a, threads), 0);
          return (
            <button key={f.id} className="tile" onClick={() => setOpenFolder(f.id)}>
              <span className="tile__icon">
                <span className="folder-icon">
                  {inside.slice(0, 4).map((a) => (
                    <AppIcon key={a.id} icon={a.icon} size="sm" />
                  ))}
                </span>
                <Badge count={count} />
              </span>
              <span className="tile__name">{f.name}</span>
            </button>
          );
        })}
      </div>

      <div className="home__dots" aria-hidden="true"><span className="on" /><span /></div>
      <div className="home__dock">{dock.map(tile)}</div>

      {folder && (
        <div className="folder" role="dialog" aria-label={folder.name}>
          <button className="folder__scrim" aria-label={S.closeFolder} onClick={() => setOpenFolder(null)} />
          <div className="folder__panel">
            <div className="folder__title">{folder.name}</div>
            <div className="folder__grid">{apps.filter((a) => a.folder === folder.id).map(tile)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
