export type LiturgyMetadata = {
  season: string | null,
  color: string | null
}

export type Missallete = {
  type: MissalleteType,
  date: string,
  content: string,
  metadata?: LiturgyMetadata
}

export type LiturgyChoice = {
  id: "saturday" | "sunday",
  missallete: Missallete
}

export type MissalleteResponse = Missallete & {
  choices?: LiturgyChoice[]
}

export type MissalleteType = "html" | "pdf";