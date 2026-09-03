# Linguagem Ubíqua — Lista de Espera de Ingressos

Glossário dos termos da feature. Os nomes usados no código correspondem aos
termos abaixo (indicados entre parênteses).

| Termo | Definição |
| --- | --- |
| **Lista de Espera** (`WaitingList`) | Agregado que representa a fila de uma seção esgotada, identificado por evento + seção (`event_id` + `section_id`). Guarda as entradas na ordem de chegada. |
| **Entrada da Lista de Espera** (`WaitingListEntry`) | Entidade filha da lista: um cliente que aguarda uma vaga, com `status` e data de chegada (`created_at`). |
| **Status da Entrada** (`WaitingListEntryStatus`) | Estado de uma entrada: `PENDING` (aguardando) ou `NOTIFIED` (já avisado de que abriu uma vaga). |
| **Ordem de Chegada** (`created_at`) | Critério FIFO da fila: a primeira entrada `PENDING` a chegar é a primeira a ser notificada. |
| **Entrar na Fila** (`WaitingListService.joinWaitingList` / `WaitingList.addEntry`) | Comando pelo qual um cliente entra na lista de espera de uma seção esgotada, nascendo `PENDING`. |
| **Seção Esgotada** (*sold out*) | Seção sem nenhum lugar disponível para reserva; derivada da disponibilidade dos lugares, nunca de um contador. Só nela é permitido entrar na fila. |
| **Cancelamento de Pedido** (`Order.cancel` / `OrderCancelled`) | Comando que passa o pedido para `CANCELLED` e registra o evento de domínio, carregando o `event_spot_id`. |
| **Liberação de Lugar** (`Event.markSpotAsAvailable` / `EventSpotReleased`) | Reação ao cancelamento: o lugar deixa de estar reservado e o agregado `Event` registra que a vaga foi liberada. |
| **Trava de Reserva** (`SpotReservation`) | Registro que trava um lugar durante a compra; é removido quando o lugar é liberado. |
| **Lugar** (`EventSpot`) | Assento de uma seção; pode estar reservado (`is_reserved`) e publicado (`is_published`). |
| **Notificação / Oferta de Vaga** (`WaitingList.offerSpotToNext` / `SpotOfferedToWaitingCustomer`) | Promoção da primeira entrada `PENDING` para `NOTIFIED`, registrando que a vaga foi oferecida ao cliente. |
| **Política** (`EventSpotReleasedHandler`) | Regra que amarra as pontas: quando um lugar é liberado, notifica o primeiro da fila daquela seção (apenas avisa, sem reserva nem prioridade). |
| **Evento de Integração** (`SpotOfferedToWaitingCustomerIntegrationEvent`) | Mensagem que cruza a fronteira do sistema (RabbitMQ) levando a notificação ao contexto de e-mails. |
