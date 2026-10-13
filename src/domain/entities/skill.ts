import { ArgumentError } from '../exceptions';

export class Skill {
  readonly name: string;

  constructor(name: string) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new ArgumentError('Tên kỹ năng không được để trống.');
    }
    this.name = name.trim();
  }
}

/** Tập kỹ năng không phân biệt hoa thường theo tên. */
export class SkillSet {
  private readonly items = new Map<string, Skill>();

  constructor(skills: Iterable<Skill> = []) {
    for (const skill of skills) this.add(skill);
  }

  static key(name: string): string {
    return name.toLowerCase();
  }

  get size(): number {
    return this.items.size;
  }

  has(skill: Skill): boolean {
    return this.items.has(SkillSet.key(skill.name));
  }

  add(skill: Skill): boolean {
    if (this.has(skill)) return false;
    this.items.set(SkillSet.key(skill.name), skill);
    return true;
  }

  clear(): void {
    this.items.clear();
  }

  values(): Skill[] {
    return [...this.items.values()];
  }
}
