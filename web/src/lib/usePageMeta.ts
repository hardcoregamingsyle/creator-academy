import { useEffect } from "react";
import { brand } from "@shared/brand";

export type PageMeta = {
  /** Page title; rendered through the title template ("%s · CREATEVA"). Omit to use the site default. */
  title?: string;
  description?: string;
  /** Adds <meta name="robots" content="noindex, nofollow">. */
  noindex?: boolean;
};

/** Defaults a layout can set for every page beneath it; pages override `title`/`description`. */
export type LayoutMeta = PageMeta & {
  /** Used verbatim when no page sets a title (e.g. "Admin"). */
  defaultTitle?: string;
  /** e.g. "%s · Admin · CREATEVA". */
  titleTemplate?: string;
};

const DEFAULT_TITLE = `${brand.name} — Live workshops for creators`;
const DEFAULT_TEMPLATE = `%s · ${brand.name}`;

type Entry = { layer: number; seq: number; meta: LayoutMeta };

const entries = new Set<Entry>();
let seq = 0;
let defaultDescription: string | null = null;

function descriptionTag(): HTMLMetaElement {
  let tag = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!tag) {
    tag = document.createElement("meta");
    tag.name = "description";
    document.head.appendChild(tag);
  }
  return tag;
}

function apply() {
  const ordered = [...entries].sort((a, b) => a.layer - b.layer || a.seq - b.seq);
  let title: string | undefined;
  let defaultTitle: string | undefined;
  let template: string | undefined;
  let description: string | undefined;
  let noindex = false;
  for (const { meta } of ordered) {
    if (meta.title !== undefined) title = meta.title;
    if (meta.defaultTitle !== undefined) defaultTitle = meta.defaultTitle;
    if (meta.titleTemplate !== undefined) template = meta.titleTemplate;
    if (meta.description !== undefined) description = meta.description;
    if (meta.noindex) noindex = true;
  }

  document.title = title ? (template ?? DEFAULT_TEMPLATE).replace("%s", () => title) : (defaultTitle ?? DEFAULT_TITLE);

  const desc = descriptionTag();
  if (defaultDescription === null) defaultDescription = desc.content || brand.description;
  desc.content = description ?? defaultDescription;

  const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (noindex) {
    const tag = robots ?? Object.assign(document.createElement("meta"), { name: "robots" });
    tag.content = "noindex, nofollow";
    if (!robots) document.head.appendChild(tag);
  } else {
    robots?.remove();
  }
}

function useMeta(meta: LayoutMeta, layer: number) {
  const { title, description, noindex, defaultTitle, titleTemplate } = meta;
  useEffect(() => {
    const entry: Entry = { layer, seq: ++seq, meta: { title, description, noindex, defaultTitle, titleTemplate } };
    entries.add(entry);
    apply();
    return () => {
      entries.delete(entry);
      apply();
    };
  }, [layer, title, description, noindex, defaultTitle, titleTemplate]);
}

/**
 * Sets the document title, meta description and robots noindex for the page
 * that calls it, and restores the previous values on unmount. The title uses
 * the same template as the Next metadata: "%s · CREATEVA"; with no title the
 * default ("CREATEVA — Live workshops for creators") is used.
 */
export function usePageMeta(meta: PageMeta = {}): void {
  useMeta(meta, 1);
}

/** For layouts (AdminLayout): page-level `usePageMeta` calls underneath always win over these defaults. */
export function useLayoutMeta(meta: LayoutMeta): void {
  useMeta(meta, 0);
}
