// The few file operations the plugin inventory needs, so the same reading code runs on this host's
// disk and on a snapshot taken inside a WSL distro (where Windows path semantics would be wrong).
import { readdir, stat } from 'node:fs/promises'
import * as nodePath from 'node:path'
import { readPluginMetadataFile } from '../../skills/discovery/plugin-skill-metadata'

export type PluginFolderEntry = { name: string; isDirectory: boolean; isFile: boolean }

export type PluginFolderFs = {
  path: Pick<
    nodePath.PlatformPath,
    'basename' | 'extname' | 'isAbsolute' | 'join' | 'relative' | 'resolve' | 'sep'
  >
  /** A metadata file's text; null when missing, not a file, too large or unreadable. */
  readText(path: string): Promise<string | null>
  stat(path: string): Promise<{ isDirectory: boolean; isFile: boolean } | null>
  readdir(path: string): Promise<PluginFolderEntry[]>
}

export const nativePluginFolderFs: PluginFolderFs = {
  path: nodePath,
  readText: (path) => readPluginMetadataFile(path),
  stat: (path) =>
    stat(path).then(
      (entry) => ({ isDirectory: entry.isDirectory(), isFile: entry.isFile() }),
      () => null
    ),
  readdir: (path) =>
    readdir(path, { withFileTypes: true }).then(
      (entries) =>
        entries.map((entry) => ({
          name: entry.name,
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile()
        })),
      () => []
    )
}
