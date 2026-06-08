# FileMane

Aplicação local para gestão documental de gabinete de contabilidade, pensada para um único utilizador em `localhost` e preparada para evoluir para acesso remoto.

## Stack

- Backend: Node.js + Express
- Base de dados: SQLite com `better-sqlite3`
- Upload: `multer`
- Frontend: HTML, JavaScript e CSS local, sem dependência de CDN

## Executar

```bash
npm install
npm start
```

A aplicação fica disponível em `http://localhost:3000`.

## Configuração

A pasta física dos documentos pode ser definida no Dashboard. Também pode ser definida ao arrancar a aplicação:

```bash
DOCUMENTS_ROOT="/caminho/para/Documentos" npm start
```

Por omissão, os documentos são guardados em `Documentos/<Cliente>/<Tipo>/`.

## Funcionalidades

- Upload de documentos com cliente,z número de cliente, NIF, tipo e observações
- Registo automático de nome original, caminho físico, data/hora, tamanho e extensão
- Metadados em SQLite
- Clientes e tipos começam vazios e podem ser guardados durante o upload
- Autocomplete incremental para clientes e tipos
- Preenchimento automático de número/NIF ao escolher cliente guardado
- Pesquisa por cliente, número, NIF, um ou vários tipos, intervalo de datas e texto
- Resultados com abrir PDF no browser, abrir outros ficheiros pela aplicação predefinida do sistema operativo e abrir pasta física
- Dashboard com totais, tamanho ocupado, documentos recentes e configuração local

## Testes

```bash
npm test
```

## Evolução prevista

A API está separada da interface para facilitar futuras funcionalidades: autenticação, backup automático, acesso remoto, multiutilizador, digitalização direta, OCR, etiquetas e exportação de relatórios.
