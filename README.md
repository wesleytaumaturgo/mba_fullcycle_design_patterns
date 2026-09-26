# Desafio MBA Full Cycle — Design Patterns

Fechamento de faturamento sobre o projeto base: `POST /close_invoicing` persiste o fechamento de um período,
`GET /invoices` lê as faturas persistidas e `POST /generate_invoices` continua sendo apenas simulação.

Stack do projeto base, mantida: TypeScript + Express + pg-promise + PostgreSQL, testes com Jest.

## 1. Subir o banco

O projeto espera um PostgreSQL em `localhost:5432`, usuário `postgres`, senha `123456`, banco `app`.
A connection string está fixa em `src/infra/database/PgPromiseAdapter.ts`.

```
PGPASSWORD=123456 psql -U postgres -h localhost -c "drop database if exists app;"
PGPASSWORD=123456 psql -U postgres -h localhost -c "create database app;"
PGPASSWORD=123456 psql -U postgres -h localhost -d app -c 'create extension if not exists "uuid-ossp";'
PGPASSWORD=123456 psql -U postgres -h localhost -d app -v ON_ERROR_STOP=1 -f create.sql
```

O `drop` e o `create database` vão em comandos separados: o PostgreSQL não aceita os dois na mesma string do `psql`.

O `create.sql` já cria a extensão `uuid-ossp` na primeira linha, então a terceira linha acima é redundante e está
aqui só por seguir o fluxo do enunciado; rodar as duas não causa erro. O `create.sql` é reexecutável: ele começa
com `drop schema if exists branas cascade`, recria o schema `branas` e recarrega a massa de dados. Rodá-lo de novo
sobre um banco já criado termina sem erro e devolve o banco ao mesmo estado inicial.

## 2. Instalar e subir a API

```
npm install
npm start
```

`npm start` equivale à forma longa do enunciado:

```
TZ=America/Sao_Paulo npx ts-node src/main.ts
```

A API sobe na porta 3000. O `TZ=America/Sao_Paulo` já vai embutido no script `start` do `package.json`.

## 3. Rodar a suíte

Com a API de pé (há um teste que chama a API por HTTP), em outro terminal:

```
npm test
```

Equivalente à forma longa:

```
TZ=America/Sao_Paulo npx jest
```

O `TZ=America/Sao_Paulo` não é opcional: as datas das faturas são comparadas com instantes absolutos, e rodar a
suíte em outro fuso quebra as asserções de data sem que haja nada de errado no código. Por isso ele está fixado
nos dois scripts do `package.json` (`start` e `test`).

A suíte também toca o banco: ela usa o mesmo `app` de `localhost:5432` e limpa os períodos que usa antes de cada
caso, então pode rodar sobre um banco recém-criado pelo passo 1.

## 4. Endpoints

### `POST /close_invoicing`

Calcula e persiste o fechamento do período, substituindo o fechamento anterior do mesmo período/regime.
Aceita `format` opcional (`json`, o padrão, ou `csv`).

```
curl -s -X POST http://localhost:3000/close_invoicing -H 'Content-Type: application/json' -d '{"month":1,"year":2022,"type":"accrual"}'
```

Resposta:

```
[{"date":"2022-01-01T13:00:00.000Z","amount":500}]
```

No terminal da API aparece o resumo impresso pelo `SendEmail`:
`{ month: 1, year: 2022, type: 'accrual', invoices: 1, total: 500 }`.

Com `format` csv:

```
curl -s -X POST http://localhost:3000/close_invoicing -H 'Content-Type: application/json' -d '{"month":1,"year":2022,"type":"cash","format":"csv"}'
```

Resposta:

```
2022-01-05;6000
```

### `GET /invoices`

Lê as faturas persistidas do período/regime, ordenadas por data crescente. Recebe `month`, `year`, `type` e
`format` opcional pela query string. Período sem faturas responde lista vazia.

```
curl -s "http://localhost:3000/invoices?month=1&year=2022&type=accrual"
```

Resposta:

```
[{"date":"2022-01-01T13:00:00.000Z","amount":500}]
```

Com `format` csv:

```
curl -s "http://localhost:3000/invoices?month=1&year=2022&type=cash&format=csv"
```

Resposta:

```
2022-01-05;6000
```

Período sem faturas:

```
curl -s "http://localhost:3000/invoices?month=3&year=2023&type=cash"
```

Resposta:

```
[]
```

### `POST /generate_invoices`

Simulação: calcula e devolve as faturas do período sem persistir nada. Aceita `format` opcional.

```
curl -s -X POST http://localhost:3000/generate_invoices -H 'Content-Type: application/json' -d '{"month":1,"year":2022,"type":"accrual"}'
```

Resposta:

```
[{"date":"2022-01-01T13:00:00.000Z","amount":500}]
```

Com `format` csv:

```
curl -s -X POST http://localhost:3000/generate_invoices -H 'Content-Type: application/json' -d '{"month":1,"year":2022,"type":"accrual","format":"csv"}'
```

Resposta:

```
2022-01-01;500
```

Depois dessa chamada, o `GET /invoices` do mesmo período continua devolvendo exatamente as faturas que já estavam
persistidas: a simulação não escreve no banco.

## 5. Convenção da query string

O tipo do callback em `HttpServer` é apenas `Function`, então o contrato da porta não é expresso pelo TypeScript:
ele é a ordem e o significado dos argumentos. A convenção adotada, documentada no próprio
`src/infra/http/HttpServer.ts`, é que o adapter invoca todo callback registrado em `on` com quatro argumentos,
sempre nesta ordem:

1. `params` — parâmetros da rota
2. `body` — corpo da requisição
3. `headers` — cabeçalhos da requisição
4. `query` — query string, como o objeto chave/valor que o parser do Express produz

O quarto argumento é a query string, e ela chega como o objeto chave/valor que o parser do Express produz, sem
tipo próprio do framework: nenhum tipo do Express atravessa a fronteira da infra. Valores repetidos ou aninhados
chegam na forma que o parser devolve, e cada rota converte o que precisa. As rotas deste projeto usam chaves
escalares (`month`, `year`, `type`, `format`), e o controller converte `month` e `year` com `Number()`.
Quem preenche esses quatro argumentos é o `ExpressAdapter`, o único ponto do projeto que conhece `req`/`res`.

Na mesma porta vale a convenção de resposta: quando o callback devolve uma string (caso do CSV), o adapter
responde texto puro; quando devolve objeto ou array, mantém a serialização JSON de antes. Isso é o que permite
o CSV sair sem aspas envolventes, sem mudar nenhuma resposta JSON existente.

## 6. Onde vive a transação e como a atomicidade foi provada

A transação é uma capacidade da porta de conexão: `DatabaseConnection` (`src/infra/database/DatabaseConnection.ts`)
expõe `transaction(work)`, e o `PgPromiseAdapter` a implementa com o `tx` do pg-promise, entregando ao callback um
`PgPromiseTransaction` — um `DatabaseConnection` cujas queries rodam todas dentro daquele mesmo `tx`. A fronteira
da transação fica em `InvoiceDatabaseRepository.replacePeriod` (`src/infra/repository/InvoiceDatabaseRepository.ts`):
uma transação por fechamento, abrindo o `delete` do período e todos os `insert` do lote dentro dela. O caso de uso
`CloseInvoicing` não sabe que existe transação; ele pede ao repositório que substitua o período, e o repositório
garante que a substituição é tudo ou nada.

A atomicidade é provada pelo teste de falha no meio do lote, em `test/CloseInvoicing.test.ts`, caso
**"Deve desfazer tudo quando a persistência falha no meio do lote"**. Ele fecha o período uma vez para deixar uma
fatura já persistida, guarda o `id_invoice` dela, e então executa um novo fechamento com um `ContractRepository`
que devolve dois contratos: o primeiro válido (cujo `insert` entra) e o segundo apontando para um contrato
inexistente, que viola a chave estrangeira e derruba o segundo `insert`. O teste afirma que a chamada rejeita e
que, depois da falha, o banco está exatamente como estava antes: continua havendo uma única fatura no período,
com o mesmo `id_invoice` e o mesmo valor de antes, e nenhuma linha do lote novo sobrou. É isso que separa uma
Unit of Work de uma sequência de queries: se cada `insert` abrisse a própria transação, o `delete` e o primeiro
`insert` teriam ficado de pé e o teste falharia.

## 7. Limitações

Nenhuma limitação do projeto base travou algum requisito do desafio — todos foram atendidos sem reescrever
mecanismo do professor.

Vale registrar uma característica herdada do projeto base, mantida de propósito: a connection string está fixa
em `src/infra/database/PgPromiseAdapter.ts`, sem configuração por ambiente. Por isso o banco precisa estar
exatamente em `localhost:5432` com usuário `postgres`, senha `123456` e banco `app`, como descrito no passo 1.
Externalizar isso mudaria o mecanismo de conexão do projeto base e está fora do escopo da entrega.
