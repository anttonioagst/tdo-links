import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const emptyDb = {
  offers: [],
  drafts: [],
  clicks: [],
  experiments: [],
  reports: [],
  settings: {
    mode: "limited",
    autoPublishThreshold: 85,
    reviewThreshold: 70
  },
  publishLog: []
};

export class JsonDb {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = structuredClone(emptyDb);
  }

  async load() {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      this.state = JSON.parse(await readFile(this.filePath, "utf8"));
      this.state = { ...structuredClone(emptyDb), ...this.state };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.save();
    }
    return this.state;
  }

  async save() {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.state, null, 2));
  }

  nextId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
