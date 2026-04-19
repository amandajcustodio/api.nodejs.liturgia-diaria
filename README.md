# Liturgia Diaria - Backend API

API em Node.js + TypeScript para retornar o folheto/liturgia do dia.

## Tecnologias

- Node.js
- TypeScript
- Express
- Firebase Admin

## Funcionalidade

A API expoe um endpoint para buscar o conteudo do dia:

- Tenta obter primeiro um PDF de folheto
- Se nao encontrar PDF, tenta obter a liturgia em HTML
- Se nao encontrar nenhum, retorna erro 404

## Endpoint

### GET /missallete/today

Retorna um objeto JSON no formato:

```json
{
  "type": "pdf",
  "date": "2026-04-19",
  "content": "https://..."
}
```

Campos:

- `type`: `"pdf"` ou `"html"`
- `date`: data no formato `YYYY-MM-DD`
- `content`: URL do PDF ou HTML da liturgia

## Estrutura principal

- `src/index.ts`: inicializacao do servidor
- `src/routes/missallete.route.ts`: rota principal
- `src/modules/missallete/missallete.service.ts`: regra de fallback PDF -> HTML
- `src/modules/pdf/pdf.service.ts`: coleta de PDF
- `src/modules/liturgy/liturgy.service.ts`: coleta/sanitizacao de HTML

## Requisitos

- Node.js 20+
- npm

## Instalacao

```bash
npm install
```

## Executar em desenvolvimento

```bash
npm start
```

O script `start` usa `tsc-watch` e inicia a API em:

- `http://localhost:3000`

## Configuracao Firebase

A aplicacao chama `initializeApp()` do Firebase Admin no startup.
Configure credenciais do Firebase no ambiente (ADC/service account) antes de iniciar em producao.

## Teste rapido

Com a API em execucao, acesse:

- `https://api-nodejs-liturgia-diaria.vercel.app/missallete/today`

## Possiveis respostas de erro

- 404: quando nao encontra PDF nem liturgia em HTML
- 500: erro inesperado no processamento
