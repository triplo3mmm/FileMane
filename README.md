# FileMane

Aplicação local (localhost) para gestão documental de gabinete de contabilidade.

## Stack

- Backend: Node.js + Express
- Base de dados: SQLite (better-sqlite3)
- Frontend: HTML/JS com TailwindCSS

## Executar

```bash
npm install
npm start
```

Aplicação disponível em `http://localhost:3000`.

## Testes

```bash
npm test
```

## Funcionalidades principais

- Upload de documentos com metadados obrigatórios e observações opcionais
- Armazenamento físico em `Documentos/<Cliente>/<Tipo>/...`
- Registo de metadados em SQLite
- Gestão de clientes e tipos de documento
- Autocomplete incremental para clientes e tipos
- Pesquisa avançada por cliente, NIF, tipo(s), datas e texto
- Lista de resultados com abrir documento e abrir pasta
- PDFs abrem diretamente no browser; outros formatos podem ser abertos na aplicação predefinida do sistema operativo
