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

Sistema de Gestão Documental para Gabinete de Contabilidade

Pretendo desenvolver uma aplicação web local (localhost) para gestão documental destinada a um gabinete de contabilidade com um único utilizador.
Objetivo

A aplicação deve permitir armazenar, organizar e pesquisar documentos de vários clientes de forma simples e rápida.

Inicialmente a aplicação será executada apenas localmente no computador do utilizador, mas a arquitetura deve ser preparada para permitir futuramente acesso remoto através da internet.
Requisitos Principais
Upload de Documentos

Ao adicionar um documento, o sistema deve solicitar:

    Tipo de documento
    Cliente
    Número de cliente
    NIF do cliente
    Observações opcionais

Além disso, o sistema deve registar automaticamente:

    Nome original do ficheiro
    Caminho físico do ficheiro
    Data e hora do upload
    Tamanho do ficheiro
    Extensão do ficheiro

Armazenamento

Os ficheiros devem ser guardados fisicamente numa pasta definida pelo utilizador.

Exemplo:

Documentos/
├── Cliente A/
│ ├── Faturas/
│ ├── IRS/
│ └── Contratos/
├── Cliente B/
└── Cliente C/

Os metadados devem ser guardados numa base de dados local SQLite (preferível) ou em ficheiros JSON.

Cada registo deve conter:

    ID único
    Nome do cliente
    Número do cliente
    NIF
    Tipo de documento
    Caminho do ficheiro
    Data de upload
    Observações

Gestão de Clientes

Inicialmente não existirão clientes registados.

Quando o utilizador introduzir um cliente inexistente:

    O sistema deve permitir a introdução manual.
    No final do upload deve perguntar:
    "Deseja adicionar este cliente à base de dados?"
    Caso aceite, o cliente fica disponível para futuras seleções.

Cada cliente deve possuir:

    Nome
    Número de cliente
    NIF

Gestão de Tipos de Documento

Inicialmente não existirão tipos de documento pré-definidos.

Quando o utilizador escrever um novo tipo:

    O sistema aceita o valor.
    No final pergunta:
    "Deseja guardar este tipo para utilização futura?"
    Caso aceite, o tipo passa a surgir nas listas de seleção.

Exemplos:

    Faturas
    IRS
    IVA
    Contratos
    Recibos
    Segurança Social
    Outros

Autocomplete

Durante a escrita:

    Clientes existentes devem aparecer automaticamente.
    Tipos existentes devem aparecer automaticamente.
    Deve existir pesquisa incremental (autocomplete).

Pesquisa Avançada

O utilizador deve conseguir pesquisar documentos utilizando qualquer combinação de filtros:
Cliente

    Nome
    Número de cliente
    NIF

Tipo de Documento

    Um ou vários tipos

Datas

    Entre duas datas
    Desde uma data
    Até uma data

Texto

    Nome do ficheiro
    Observações

Resultados

A pesquisa deve mostrar:

    Nome do ficheiro
    Cliente
    NIF
    Tipo de documento
    Data de upload
    Botão para abrir o ficheiro
    Botão para abrir a pasta onde o ficheiro está guardado

Interface

Pretendo uma interface moderna, simples e profissional.

Deve incluir:

    Dashboard principal
    Página de upload
    Página de pesquisa
    Gestão de clientes
    Gestão de tipos de documento

Tecnologias

Preferência:

VUE

Frontend:

    React
    TypeScript
    TailwindCSS

Backend:

    Node.js
    Express

Base de dados:

    SQLite

Estrutura

A aplicação deve manter uma estrutura simples.

Evitar criar dezenas de ficheiros pequenos sem necessidade.

Pretendo uma organização limpa e profissional, mas com o menor número possível de ficheiros, desde que a manutenção continue simples.
Funcionalidades Futuras

Preparar a arquitetura para permitir posteriormente:

    Login de utilizadores
    Backup automático
    Acesso remoto
    Multiutilizador
    Digitalização direta de documentos
    OCR para pesquisa dentro dos PDFs
    Etiquetas personalizadas
    Exportação de relatórios

Visualização de Documentos

Quando o utilizador efetua uma pesquisa e visualiza a lista de documentos encontrados, deve poder abrir qualquer documento diretamente sem necessidade de o descarregar.

Comportamento pretendido:

    Ao clicar num documento PDF, este deve abrir imediatamente numa nova aba ou num visualizador integrado.
    Ao clicar em ficheiros Word, Excel ou imagens, estes devem abrir utilizando a aplicação predefinida do sistema operativo.
    Não deve existir obrigatoriedade de download prévio para visualizar documentos.
    Em ambiente localhost, a aplicação deve utilizar o caminho físico do ficheiro para o abrir diretamente.
    Deve existir também um botão "Abrir Pasta" que abre a localização física do documento no Explorador de Ficheiros do Windows.

A tabela de resultados da pesquisa deve incluir:

    Nome do ficheiro
    Cliente
    NIF
    Tipo de documento
    Data de upload
    Abrir documento
    Abrir pasta
