# MBA Full Cycle - Domain Driven Design

Este repositório contém o código-fonte e material didático do curso de Domain Driven Design do MBA Full Cycle.

O projeto é feito com Nestjs, mas o conteúdo é independente de linguagem ou framework.

## Pré-requisitos

- Node.js 18+
- Docker

## Executar o projeto

Suba as aplicações MySQL, RabbitMQ e Redis:

```bash
docker-compose up -d
```

Instale as dependências do Node.js:

```bash
npm install
```

Use o arquivo `api.http` como referência para fazer as requisições HTTP. Este arquivo funciona com a extensão [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) do VSCode.

## Professor

<a href="https://github.com/argentinaluiz">
    <img src="https://avatars.githubusercontent.com/u/4926329?v=4?s=100" width="100px;" alt=""/>
    <br />
    <sub>
        <b>Luiz Carlos</b>
    </sub>
</a>

---

## Feature: Lista de Espera de Ingressos

Quando um cliente cancela um pedido, o lugar volta a ficar disponível e, se
houver fila de espera naquela seção, o primeiro cliente é notificado por e-mail.
Tudo acontece por reação a eventos de domínio, com uma política amarrando as
pontas — do comando de cancelamento ao consumo do evento de integração no app de
e-mails.

### Subir o projeto e preparar o banco

```bash
docker-compose up -d          # sobe MySQL, Redis e RabbitMQ
npm install                   # instala as dependências

# recria todas as tabelas (inclusive stored_event) a partir do mikro-orm.config.ts
npx mikro-orm schema:fresh --run

npm run start:dev             # API principal (porta 3000)
npx nest start emails         # app de e-mails (porta 3001)
```

Use o `api.http` da raiz como roteiro de requisições (parceiro → clientes →
evento → seção → `publish-all` → compra → cancelamento / fila).

### Rodar a suíte de testes

```bash
npm test
```

> Atrito herdado do projeto base: cada teste de infraestrutura recria o schema
> com `orm.schema.refreshDatabase()` registrando apenas as entities daquele
> teste, e nenhum registra o `StoredEventSchema`. Rodar a suíte, portanto,
> derruba a tabela `stored_event`. **Depois de rodar os testes, rode
> `npx mikro-orm schema:fresh --run` novamente antes de subir a API**, senão a
> primeira operação responde 500 (o listener wildcard tenta gravar o evento).

### Por que `WaitingList` é um agregado fora do `Event`

O curso trata agregados como unidades pequenas e coesas, que encapsulam apenas as
invariantes que precisam ser consistentes na mesma transação — e recomenda
quebrar um agregado quando ele começa a acumular responsabilidades que mudam por
razões e ritmos diferentes. O `Event` já é uma raiz grande (coleção de seções com
lugares, publicação e reserva, tudo consistente no ato da compra). A lista de
espera vive em outro ritmo: é assíncrona, cresce por reação a eventos e tem
invariantes próprias (sem cliente `PENDING` duplicado, promoção FIFO da primeira
entrada). Colocá-la dentro do `Event` inflaria a raiz, carregaria a fila em toda
leitura do evento e misturaria a venda imediata com a espera. Por isso a
`WaitingList` é um agregado separado, referenciando o `Event` e a seção **por ID**
(`event_id` + `section_id`), com a consistência entre eles mantida de forma
eventual por eventos de domínio e handlers.

### A cadeia completa do cancelamento

Um único `POST /events/:event_id/orders/:order_id/cancel` dispara toda a corrente,
sem que nenhum comando conheça o próximo:

1. **Comando** — `OrderService.cancel` roda dentro de `ApplicationService.run(...)`.
   `Order.cancel()` valida a invariante (não cancela duas vezes) e registra o
   evento de domínio **`OrderCancelled`** (enriquecido com `event_spot_id`).
2. **Reação 1 (liberar o lugar)** — `OrderCancelledHandler` localiza o `Event`
   dono do spot (`IEventRepository.findByEventSpotId`), chama
   `Event.markSpotAsAvailable` (o lugar deixa de estar reservado e o agregado
   registra **`EventSpotReleased`**), remove a `SpotReservation` e publica os
   eventos do `Event`.
3. **Política (notificar o primeiro da fila)** — `EventSpotReleasedHandler` carrega
   a `WaitingList` da seção; se houver fila, `WaitingList.offerSpotToNext` promove a
   primeira entrada `PENDING` para `NOTIFIED` e registra
   **`SpotOfferedToWaitingCustomer`**. O handler publica os eventos de domínio e de
   integração do agregado.
4. **Evento de integração** — `SpotOfferedToWaitingCustomer` vira
   **`SpotOfferedToWaitingCustomerIntegrationEvent`**, é enfileirado na fila Bull
   `integration-events`, o `IntegrationEventsPublisher` o leva ao RabbitMQ
   (`amq.direct`) e o **`ConsumerService` do `apps/emails`** o consome, logando o
   cliente e a seção.

A tabela `stored_event` registra `CustomerJoinedWaitingList` (ao entrar na fila),
`OrderCancelled`, `EventSpotReleased` e `SpotOfferedToWaitingCustomer`.

### Artefatos de design estratégico

- [docs/event-storming.excalidraw](docs/event-storming.excalidraw) — o event storming da feature (abra em [excalidraw.com](https://excalidraw.com)).
- [docs/linguagem-ubiqua.md](docs/linguagem-ubiqua.md) — glossário da linguagem ubíqua.
