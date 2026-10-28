import type { Library } from "@/lib/drive";

/** 내 일기장은 폴더 이름 그대로, 공유받은 것은 '누구의 my-life' */
export const libraryTitle = (lib: Pick<Library, "name" | "ownedByMe" | "ownerName">) =>
  lib.ownedByMe || !lib.ownerName ? lib.name : `${lib.ownerName}의 ${lib.name}`;
