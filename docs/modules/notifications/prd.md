# PRD — Módulo `notifications` (In-App Inbox, Transactional Emails & Preferences)

- **Status:** ✅ Aprovado
- **Fase do Roadmap:** F9
- **Spec técnica derivada:** [`./spec.md`](./spec.md)
- **Referências de mercado:** Knock, Novu, Courier, Resend, GitHub Notification Settings, Linear Inbox.

---

## 1. Visão Geral e Propósito

O módulo **`notifications`** é o hub central de **comunicação com o usuário (Inbox In-App e E-mails Transacionais Internacionalizados)** e **gestão de preferências de entrega por categoria e canal**.

Ele opera de forma **100% reativa aos eventos de integração** dos demais módulos (`iam`, `tenancy`, `billing`): nenhum outro módulo importa templates de e-mail ou chama o `MailGateway` diretamente. Quando um fato de negócio ocorre na plataforma, o `notifications` decide quem deve ser avisado, em qual idioma (`en` ou `pt-BR`) e por quais canais (`inApp` e/ou `email`).

### Fronteira do Contexto Delimitado (O que é vs. O que não é `notifications`)
- **É responsabilidade do `notifications`:** caixa de entrada in-app do usuário (`Notification`), contador de não lidas (`unreadCount`), marcação individual e em massa como lida, matriz de preferências por categoria (`NotificationPreference`), resolução de destinatários via Facades (`IamFacade` / `TenancyFacade`) e orquestração de envio de e-mails internacionalizados via `MailGateway` (`src/integrations/mail/`).
- **NÃO é responsabilidade do `notifications`:** gerar tokens de autenticação ou convite (já vêm gerados pelos módulos de origem), controlar sessões de usuário ou falar diretamente com servidores SMTP fora da porta `MailGateway` (protegida por `@Resilient('mail')`).

---

## 2. Benchmark e Padrões de Mercado Adotados

| Capacidade / Fluxo | Referência de Mercado | Padrão Adotado no Boilerplate |
|---|---|---|
| **Pipeline Híbrido (Transacional Puro vs. Notificação de Usuário)** | Knock / Novu | **1. E-mails Transacionais Puros (Auth/Invite):** verificação de e-mail, OTP de MFA, reset de senha e convites vão direto pelo consumer idempotente via `MailGateway`, sem criar item no "sininho" in-app.<br/>**2. Notificações Multicanal de Usuário:** alertas de billing, segurança e equipe passam pelo `SendNotificationCommand`, gravando na Inbox In-App e enviando e-mail conforme a preferência do usuário. |
| **Preferências Opt-Out por Categoria** | GitHub / Linear / Knock | Categorias configuráveis (`SECURITY_ALERT`, `BILLING_ALERT`, `TEAM_ACTIVITY`) nascem habilitadas por padrão (`inApp: true`, `email: true`) sem exigir registro prévio no banco (*lazy persistence*). E-mails transacionais críticos de acesso à conta são obrigatórios e não podem ser desativados. |
| **Internacionalização (i18n) Tardia na Inbox** | Knock / Novu | A `Notification` in-app armazena a chave semântica (`titleI18nKey`, `bodyI18nKey`) e as variáveis (`interpolationArgs`) em vez de texto estático. Assim, se o usuário mudar seu idioma de `pt-BR` para `en`, toda a sua Inbox é exibida no novo idioma. |
| **Inbox de Alta Performance ("Sininho")** | Linear / GitHub | View desnormalizada no MongoDB (`user_notifications_views`) com contador `unreadCount` mantido atomicamente e suporte tanto a **marcar 1 como lida** quanto a **marcar todas como lidas** (`read-all`). |

---

## 3. Mapa de Eventos Consumidos e Roteamento de Canais

### 3.1. Pipeline 1 — E-mails Transacionais Críticos (Obrigatórios, Apenas E-mail)

Estes eventos disparam e-mail imediato via `MailGateway` (com idempotência garantida em `processed_events` — ADR-0008) e **não** criam registro na Inbox In-App:

| Evento de Origem | Destinatário | Template i18n | Motivo de ser Apenas E-mail (Obrigatório) |
|---|---|---|---|
| `iam.email_verification.requested.v1` | E-mail do payload | `emails.iam.verify_email` | Usuário ainda não verificou a conta e não consegue fazer login. |
| `iam.mfa.email_otp_requested.v1` | E-mail do payload | `emails.iam.mfa_email_otp` | Usuário está na tela de login aguardando o código de 6 dígitos. |
| `iam.password.reset_requested.v1` | E-mail do payload | `emails.iam.password_reset` | Usuário perdeu acesso à senha. |
| `iam.user.deletion_requested.v1` | E-mail do payload | `emails.iam.account_deletion_scheduled` | Todas as sessões foram revogadas; avisa sobre a janela de 15 dias. |
| `iam.user.deletion_canceled.v1` | E-mail do payload | `emails.iam.account_deletion_canceled` | Confirmação crítica de restauração da conta. |
| `tenancy.member.invited.v1` | E-mail do convidado | `emails.tenancy.organization_invite` | O e-mail convidado pode ainda nem possuir conta (`userId`) na plataforma. |

### 3.2. Pipeline 2 — Notificações Multicanal de Usuário (`SendNotificationCommand`: In-App + E-mail Configurável)

Estes eventos acionam o `SendNotificationCommand` para destinatários identificados por `userId`, respeitando as preferências da categoria (`NotificationCategory`):

| Evento de Origem | Categoria | Como resolve o(s) `userId` destinatário(s) | Conteúdo / Efeito |
|---|---|---|---|
| `billing.invoice.payment_failed.v1` | `BILLING_ALERT` | Consulta `TenancyFacade.getOrganizationOwnerUserIds(orgId)` + `IamFacade.getUsersSummaryByIds(ownerIds)` | Alerta cada `Owner` da organização sobre a falha na cobrança da fatura (In-App + E-mail com link para regularizar). |
| `iam.password.changed.v1` | `SECURITY_ALERT` | `userId` do evento (dados via `IamFacade.getUserSummaryById`) | Alerta que a senha da conta foi alterada. |
| `iam.mfa.enabled.v1` | `SECURITY_ALERT` | `userId` do evento (`IamFacade`) | Confirma ativação de MFA na conta. |
| `iam.mfa.disabled.v1` | `SECURITY_ALERT` | `userId` do evento (`IamFacade`) | Alerta que o MFA foi desativado na conta. |
| `iam.session.revoked.v1` *(apenas se `reason === 'TOKEN_REUSE_DETECTED'`)* | `SECURITY_ALERT` | `userId` do evento (`IamFacade`) | Alerta de segurança informando que uma sessão foi encerrada por tentativa suspeita de reuso de token. |
| `tenancy.member.accepted.v1` | `TEAM_ACTIVITY` | `invitedByUserId` (quem enviou o convite) | Avisa na Inbox/E-mail que o convidado aceitou o convite e entrou na organização. |

---

## 4. Personas e Jornadas do Usuário

### J1 — Recebimento de E-mail Transacional Internacionalizado
1. Quando um evento do Pipeline 1 ou Pipeline 2 precisa enviar um e-mail, o módulo `notifications` identifica o `locale` do destinatário (`pt-BR` ou `en`).
2. Renderiza o assunto e o corpo do template i18n correspondente e envia através do `MailGateway` (em dev local entregue no Mailpit; em produção via SMTP/provedor configurado, protegido por `@Resilient('mail')`).

### J2 — Alerta de Falha de Cobrança para os `Owners` da Organização
1. Uma cobrança recorrente falha no Stripe/Asaas e o módulo `billing` publica `billing.invoice.payment_failed.v1`.
2. O subscriber do `notifications` descobre quem são os `Owners` daquela organização via `TenancyFacade.getOrganizationOwnerUserIds(organizationId)` e busca seus perfis (`email`, `name`, `locale`) via `IamFacade.getUsersSummaryByIds(ownerIds)`.
3. Para cada `Owner`, executa o `SendNotificationCommand` na categoria `BILLING_ALERT`.
4. A notificação aparece no sininho in-app de cada `Owner` (com `actionUrl: '/organizations/:orgId/billing'`) e o e-mail de alerta é enviado.

### J3 — Uso da Inbox In-App ("Sininho")
1. **Listagem e Badge (`GET /me/notifications`):**
   - O usuário autenticado abre a aplicação. O endpoint consulta `user_notifications_views` no MongoDB e retorna em `< 5ms` o `unreadCount` total e a lista de notificações paginada por cursor (aceitando filtro `?unreadOnly=true`), já com `title` e `body` traduzidos no idioma da requisição/usuário.
2. **Marcar 1 como lida (`PATCH /me/notifications/:notificationId/read`):**
   - Ao clicar em uma notificação, o frontend chama o endpoint. Se ela ainda não estava lida (`readAt === null`), define `readAt = now()`, emite `notifications.notification.read.v1` e decrementa `unreadCount` no MongoDB. (Operação idempotente: chamar novamente para uma notificação já lida retorna `204 No Content` sem decrementar duas vezes).
3. **Marcar todas como lidas (`POST /me/notifications/read-all`):**
   - O usuário clica em *"Marcar todas como lidas"* no topo do sininho.
   - O `MarkAllNotificationsAsReadCommand` atualiza todas as notificações não lidas daquele `userId` (`readAt = now()`), emite `notifications.notifications.all_read.v1` e zera `unreadCount = 0` na view do MongoDB.

### J4 — Gestão de Preferências de Notificação e Limpeza LGPD
1. **Consulta (`GET /me/notification-preferences`):**
   - Retorna a matriz das 3 categorias configuráveis (`SECURITY_ALERT`, `BILLING_ALERT`, `TEAM_ACTIVITY`) com o status atual dos canais `{ inApp: boolean, email: boolean }` (retornando `true` para categorias que o usuário nunca alterou).
2. **Atualização (`PUT /me/notification-preferences`):**
   - O usuário pode desativar, por exemplo, e-mails de `TEAM_ACTIVITY` mantendo `inApp: true`.
3. **Limpeza por Anonimização (`iam.user.anonymized.v1`):**
   - Quando uma conta é anonimizada no `iam`, o subscriber `OnUserAnonymizedNotificationsSubscriber` remove todas as notificações e preferências daquele `userId` no PostgreSQL e apaga os documentos correspondentes em `user_notifications_views` no MongoDB.

---

## 5. Requisitos Funcionais (RF) e Regras de Negócio

### RF-01 — Idempotência de Envio de E-mails e Criação de Notificações
- Como o Kafka garante entrega *at-least-once*, todo consumer do módulo `notifications` herda de `BaseSubscriber` (`processed_events` — ADR-0008). Um mesmo `eventId` jamais enviará dois e-mails iguais nem criará duas notificações duplicadas na Inbox.
- Se todos os canais (`inApp: false` e `email: false`) estiverem desabilitados pelo usuário para uma categoria no `SendNotificationCommand`, o Command conclui com sucesso (`Right`) sem gravar notificação in-app e sem disparar e-mail.

### RF-02 — Isolamento de Propriedade da Notificação
- Um usuário só pode ler ou marcar como lida uma `Notification` cujo `recipientUserId` seja igual ao seu `jwt.sub`. Tentar marcar notificação de outro usuário retorna `COMMON.RESOURCE_NOT_FOUND` (`404`).

### RF-03 — Marcação Idempotente de Leitura
- Marcar uma notificação que já possui `readAt !== null` como lida é um *no-op* seguro (retorna sucesso e **não** reemite `notifications.notification.read.v1`, preservando a exatidão do contador `unreadCount`).

---

## 6. Requisitos Não-Funcionais e Resiliência

- **Resiliência no `MailGateway` (`@Resilient('mail')` — ADR-0005):** o adaptador `NodemailerAdapter` executa sob Bulkhead + Circuit Breaker + Retry com Exponential Backoff + Timeout. Caso o servidor SMTP caia por um período prolongado, a mensagem após esgotar as retentativas do consumer vai para a `.dlq` sem travar a fila de outros eventos.
- **Retenção de Notificações In-App (TTL no MongoDB):** documentos de notificações lidas em `user_notifications_views` possuem índice TTL de **90 dias** para manter a collection enxuta e rápida.

---

## 7. Fora de Escopo (Non-Goals para o Boilerplate v1)

- Conexões persistentes de tempo real (WebSockets / Server-Sent Events — SSE) na v1: a leitura via REST no MongoDB (`< 5ms`) atende ao sininho com zero complexidade de estado de conexão.
- Canais de SMS, WhatsApp ou Web/Mobile Push Notifications (FCM / APNs).
- Campanhas de e-mail marketing em massa / newsletters.

