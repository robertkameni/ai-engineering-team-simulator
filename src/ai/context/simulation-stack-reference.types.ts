export interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

export interface VerifiedStackSnapshot {
  readonly nextMajor: number | null;
  readonly prismaMajor: number | null;
}
