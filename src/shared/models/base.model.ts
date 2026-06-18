export type LiturgyMetadata = {
  season: string | null,
  color: string | null
}

export type MeditationContent = {
  title: string | null,
  content: string,
  sourceUrl: string,
  date: string
}

export type Missallete = {
  type: MissalleteType,
  date: string,
  content: string,
  metadata?: LiturgyMetadata,
  meditation?: MeditationContent | null
}

export type LiturgyChoice = {
  id: "saturday" | "sunday",
  missallete: Missallete
}

export type MissalleteResponse = Missallete & {
  choices?: LiturgyChoice[]
}

export type MissalleteType = "html" | "pdf";