export type Missallete = {
  type: MissalleteType,
  date: string,
  content: string
}

export type MissalleteType = "html" | "pdf";