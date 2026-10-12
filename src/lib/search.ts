export interface SearchHit {
  id: string;
  name: string;
  detail: string;
  match: "startup" | "founder" | "sector";
}
