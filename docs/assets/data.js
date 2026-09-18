const DOMAIN_ORDER = ['cib', 'retail', 'risk', 'it'];
const PLATFORM_ORDER = ['databricks', 'salesforce', 'mistral', 'claude'];

export const snapshot = Object.freeze({
  id: 'banking-scenario-2026-04-30',
  capturedAt: '2026-04-30T16:00:00Z',
  label: 'Fixed synthetic snapshot',
  timezone: 'UTC',
  period: 'April 2026',
  disclosure: 'Illustrative scenario data. This static site is not connected to a live Agent Mesh deployment.'
});

export const domains = Object.freeze({
  group: { label: 'Group orchestration', short: 'Group', code: 'GRP', description: 'Cross-domain coordination and policy routing.' },
  cib: { label: 'Corporate & Investment Banking', short: 'CIB', code: 'CIB', description: 'Structuring, pricing, execution, settlement and research.' },
  retail: { label: 'Retail Banking', short: 'Retail', code: 'RET', description: 'Onboarding, lending, service, advisory and customer experience.' },
  risk: { label: 'Risk & Compliance', short: 'Risk', code: 'RSK', description: 'KYC/AML, credit, regulatory reporting, fraud and model validation.' },
  it: { label: 'IT & Operations', short: 'IT & Ops', code: 'ITO', description: 'Security, infrastructure, delivery, access and operational support.' }
});

export const platforms = Object.freeze({
  databricks: { label: 'Databricks', short: 'DBX' },
  salesforce: { label: 'Salesforce', short: 'SF' },
  mistral: { label: 'Mistral', short: 'MIS' },
  claude: { label: 'Claude', short: 'CLD' }
});

const specialistTemplates = {
  cib: [
    ['structuring', 'Product Structuring Agent', 'databricks', 'internal', 'Structures derivatives and structured notes from approved product parameters.'],
    ['market-data', 'Market Data Insights', 'databricks', 'internal', 'Queries curated market data and portfolio analytics.'],
    ['trade-exec', 'Trade Execution Agent', 'mistral', 'internal', 'Prepares order execution and best-execution checks.'],
    ['research', 'Research Summariser', 'claude', 'internal', 'Summarises approved research into reviewable investment notes.'],
    ['pricing', 'Pricing Engine Agent', 'databricks', 'internal', 'Calculates scenario pricing for derivatives and structured products.'],
    ['risk-calc', 'Risk Calculator', 'databricks', 'internal', 'Computes VaR, Greeks and portfolio sensitivities.'],
    ['settlement', 'Settlement Agent', 'mistral', 'internal', 'Coordinates post-trade reconciliation and settlement tasks.'],
    ['reporting', 'CIB Reporting Agent', 'claude', 'internal', 'Drafts CIB performance reports from governed inputs.']
  ],
  retail: [
    ['onboarding', 'Customer Onboarding Agent', 'salesforce', 'customer', 'Guides digital account opening and document collection.'],
    ['mortgage', 'Mortgage Pre-Approval Agent', 'salesforce', 'customer', 'Prepares illustrative mortgage eligibility assessments.'],
    ['sentiment', 'Customer Sentiment Agent', 'mistral', 'internal', 'Analyses survey feedback and service signals.'],
    ['advisor', 'Advisor Copilot', 'claude', 'internal', 'Assists advisors with governed product information.'],
    ['upsell', 'Next-Best-Action Agent', 'salesforce', 'customer', 'Suggests eligible next actions from customer context.'],
    ['billing', 'Billing Query Agent', 'salesforce', 'customer', 'Classifies billing enquiries and prepares responses.'],
    ['nps', 'NPS Analyser', 'mistral', 'internal', 'Aggregates channel feedback and highlights weak signals.'],
    ['scheduler', 'Appointment Scheduler', 'salesforce', 'customer', 'Coordinates branch and video appointment availability.']
  ],
  risk: [
    ['kyc', 'KYC/AML Agent', 'mistral', 'internal', 'Runs governed identity, sanctions and AML screening steps.'],
    ['credit', 'Credit Risk Scorer', 'databricks', 'internal', 'Calculates scenario credit scores using approved models.'],
    ['regulatory', 'Regulatory Reporting Agent', 'mistral', 'internal', 'Drafts evidence packs for regulatory review.'],
    ['fraud', 'Fraud Detection Agent', 'databricks', 'internal', 'Scores behavioural signals for analyst triage.'],
    ['stress', 'Stress Test Agent', 'databricks', 'internal', 'Runs approved regulatory and ad-hoc stress scenarios.'],
    ['sanctions', 'Sanctions Screening Agent', 'mistral', 'internal', 'Screens governed records against sample watchlists.'],
    ['model-val', 'Model Validation Agent', 'databricks', 'internal', 'Supports independent validation and backtesting.'],
    ['alert', 'Alert Triage Agent', 'claude', 'internal', 'Prioritises alerts for human investigation.']
  ],
  it: [
    ['security', 'Security Incident Agent', 'claude', 'internal', 'Triages sample security events and proposes runbook actions.'],
    ['infra', 'Infrastructure Monitor', 'databricks', 'internal', 'Evaluates infrastructure signals against operating thresholds.'],
    ['copilot', 'Internal Copilot', 'claude', 'internal', 'Answers employee questions from approved knowledge sources.'],
    ['deployment', 'Deployment Agent', 'mistral', 'internal', 'Coordinates gated delivery and rollback runbooks.'],
    ['backup', 'Backup & Recovery Agent', 'databricks', 'internal', 'Checks backup posture and recovery-test evidence.'],
    ['access', 'Access Management Agent', 'claude', 'internal', 'Prepares access requests and entitlement reviews.'],
    ['cost-opt', 'Cost Optimisation Agent', 'databricks', 'internal', 'Identifies scenario infrastructure efficiency opportunities.'],
    ['doc', 'Documentation Agent', 'claude', 'internal', 'Maintains technical documentation from approved sources.']
  ]
};

function hash(value) {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function telemetryFor(agent) {
  const n = hash(agent.id);
  const availability = n % 19 === 0 ? 'degraded' : n % 41 === 0 ? 'unavailable' : 'available';
  const workload = n % 13 === 0 ? 'warning' : n % 37 === 0 ? 'critical' : 'healthy';
  const executions = agent.role === 'orchestrator' ? 18640 : agent.role === 'head' ? 3100 + (n % 900) : 210 + (n % 830);
  const unitCost = agent.platform === 'claude' ? 0.094 : agent.platform === 'mistral' ? 0.061 : agent.platform === 'salesforce' ? 0.043 : 0.037;
  const monthlyCost = Math.round(executions * unitCost * (0.88 + (n % 25) / 100));
  return Object.freeze({
    availability,
    workload,
    successRate: +(93.2 + (n % 62) / 10).toFixed(1),
    latencyP50: 118 + (n % 183),
    latencyP95: 410 + (n % 740),
    escalationRate: +(1.1 + (n % 63) / 10).toFixed(1),
    groundingAccuracy: +(94 + (n % 53) / 10).toFixed(1),
    securityFindings: n % 31 === 0 ? 1 : 0,
    dependencies: 2 + (n % 6),
    feedbackScore: +(4 + (n % 10) / 10).toFixed(1),
    executions,
    tokens: executions * (850 + (n % 2100)),
    monthlyCost
  });
}

function makeAgent(agent) {
  return Object.freeze({ ...agent, telemetry: telemetryFor(agent) });
}

function buildAgents() {
  const result = [makeAgent({ id: 'orchestrator', name: 'Multi-Agent Orchestrator', domain: 'group', platform: 'mistral', role: 'orchestrator', audience: 'internal', description: 'Coordinates governed tasks across all four banking domains.' })];
  const heads = {
    cib: ['Head of CIB Agents', 'databricks', 'internal'],
    retail: ['Head of Retail Banking', 'salesforce', 'customer'],
    risk: ['Head of Risk & Compliance', 'mistral', 'internal'],
    it: ['Head of IT & Operations', 'claude', 'internal']
  };
  DOMAIN_ORDER.forEach(domain => {
    const [name, platform, audience] = heads[domain];
    result.push(makeAgent({ id: `head-${domain}`, name, domain, platform, role: 'head', audience, description: `Coordinates ${domains[domain].label} workloads and policies.` }));
  });
  DOMAIN_ORDER.forEach(domain => {
    specialistTemplates[domain].forEach((template, templateIndex) => {
      const [slug, name, platform, audience, description] = template;
      const instances = templateIndex < 5 ? 3 : 2;
      for (let instance = 1; instance <= instances; instance += 1) {
        result.push(makeAgent({
          id: `${domain}-${slug}-${String(instance).padStart(2, '0')}`,
          name: `${name} ${String(instance).padStart(2, '0')}`,
          domain,
          platform,
          role: 'specialist',
          audience,
          archetype: slug,
          description
        }));
      }
    });
  });
  return Object.freeze(result);
}

export const agents = buildAgents();
export const agentById = new Map(agents.map(agent => [agent.id, agent]));

export const governance = Object.freeze({
  findings: Object.freeze([
    { id: 'GOV-1042', time: '15:42', domain: 'risk', severity: 'critical', regulation: 'gdpr', title: 'Restricted field requested outside approved purpose', agentId: 'risk-kyc-01', outcome: 'Blocked', detail: 'Scenario policy denied the tool request before data access.' },
    { id: 'GOV-1041', time: '14:18', domain: 'retail', severity: 'high', regulation: 'dora', title: 'Approval timeout on customer-facing action', agentId: 'retail-mortgage-01', outcome: 'Escalated', detail: 'Human approval did not arrive within the sample workflow threshold.' },
    { id: 'GOV-1039', time: '12:06', domain: 'cib', severity: 'medium', regulation: 'mifid', title: 'Evidence attachment missing from recommendation', agentId: 'cib-research-01', outcome: 'Queued', detail: 'Recommendation was held for supporting-source review.' },
    { id: 'GOV-1037', time: '10:31', domain: 'it', severity: 'high', regulation: 'dora', title: 'Runtime readiness changed during tool request', agentId: 'it-deployment-01', outcome: 'Stopped', detail: 'Secure tool execution stopped after readiness became false.' },
    { id: 'GOV-1035', time: '08:54', domain: 'risk', severity: 'medium', regulation: 'acpr', title: 'Model version outside approved scenario set', agentId: 'risk-credit-01', outcome: 'Blocked', detail: 'The sample scoring request referenced an unapproved model version.' },
    { id: 'GOV-1033', time: '07:19', domain: 'retail', severity: 'low', regulation: 'gdpr', title: 'Retention label nearing review date', agentId: 'retail-onboarding-01', outcome: 'Review', detail: 'Scenario record is scheduled for policy-owner review.' },
    { id: 'GOV-1030', time: '04:47', domain: 'cib', severity: 'low', regulation: 'mifid', title: 'Execution rationale metadata incomplete', agentId: 'cib-trade-exec-01', outcome: 'Review', detail: 'Best-execution evidence requires an additional rationale field.' }
  ]),
  regulations: Object.freeze([
    { id: 'gdpr', name: 'GDPR', score: 99.1, status: 'Aligned', owner: 'Data Protection' },
    { id: 'dora', name: 'DORA', score: 97.8, status: 'Review', owner: 'Operational Resilience' },
    { id: 'mifid', name: 'MiFID II', score: 98.5, status: 'Aligned', owner: 'Markets Compliance' },
    { id: 'acpr', name: 'Prudential controls', score: 96.4, status: 'Review', owner: 'Risk Control' },
    { id: 'eu-ai', name: 'EU AI Act readiness', score: 94.2, status: 'In progress', owner: 'AI Governance' }
  ]),
  policies: Object.freeze([
    { id: 'POL-001', name: 'Purpose-bound customer data', domain: 'retail', regulation: 'gdpr', status: 'Enforced', evaluations: 812 },
    { id: 'POL-002', name: 'Human approval for credit decision', domain: 'risk', regulation: 'acpr', status: 'Enforced', evaluations: 294 },
    { id: 'POL-003', name: 'Best-execution evidence required', domain: 'cib', regulation: 'mifid', status: 'Enforced', evaluations: 487 },
    { id: 'POL-004', name: 'Runtime readiness gate', domain: 'it', regulation: 'dora', status: 'Enforced', evaluations: 1264 },
    { id: 'POL-005', name: 'EU processing boundary', domain: 'retail', regulation: 'gdpr', status: 'Enforced', evaluations: 639 },
    { id: 'POL-006', name: 'Model registry allow-list', domain: 'risk', regulation: 'acpr', status: 'Enforced', evaluations: 373 },
    { id: 'POL-007', name: 'Tool least privilege', domain: 'it', regulation: 'dora', status: 'Enforced', evaluations: 918 },
    { id: 'POL-008', name: 'Research source attribution', domain: 'cib', regulation: 'mifid', status: 'Review', evaluations: 241 }
  ]),
  access: Object.freeze([
    { from: 'cib', to: 'cib', requests: 318, decision: 'Allow' }, { from: 'cib', to: 'retail', requests: 23, decision: 'Review' }, { from: 'cib', to: 'risk', requests: 94, decision: 'Allow' }, { from: 'cib', to: 'it', requests: 61, decision: 'Allow' },
    { from: 'retail', to: 'cib', requests: 18, decision: 'Review' }, { from: 'retail', to: 'retail', requests: 401, decision: 'Allow' }, { from: 'retail', to: 'risk', requests: 127, decision: 'Allow' }, { from: 'retail', to: 'it', requests: 72, decision: 'Allow' },
    { from: 'risk', to: 'cib', requests: 82, decision: 'Allow' }, { from: 'risk', to: 'retail', requests: 114, decision: 'Allow' }, { from: 'risk', to: 'risk', requests: 356, decision: 'Allow' }, { from: 'risk', to: 'it', requests: 49, decision: 'Allow' },
    { from: 'it', to: 'cib', requests: 44, decision: 'Allow' }, { from: 'it', to: 'retail', requests: 53, decision: 'Allow' }, { from: 'it', to: 'risk', requests: 39, decision: 'Allow' }, { from: 'it', to: 'it', requests: 289, decision: 'Allow' }
  ]),
  residency: Object.freeze([
    { region: 'Paris', code: 'FR', records: 14820, status: 'EU region' },
    { region: 'Frankfurt', code: 'DE', records: 9270, status: 'EU region' },
    { region: 'Dublin', code: 'IE', records: 4110, status: 'EU region' }
  ])
});

const workflowSeeds = [
  {
    id: 'kyc-onboarding', name: 'KYC/AML corporate onboarding', description: 'A governed onboarding task crossing Retail, Risk and IT.', traceID: '0195f0c0-7a11-7a21-8a31-000000000001',
    hops: [
      ['head-retail', 'Collect corporate onboarding documents', 'ok', 312],
      ['retail-onboarding-01', 'Extract and validate submitted KYB fields', 'ok', 486],
      ['head-risk', 'Route identity checks to approved screening agents', 'ok', 178],
      ['risk-kyc-01', 'Evaluate sanctions, PEP and adverse-media signals', 'review', 742],
      ['risk-credit-01', 'Prepare initial credit-risk assessment', 'ok', 536],
      ['head-it', 'Prepare least-privilege workspace access', 'ok', 244]
    ]
  },
  {
    id: 'mortgage-preapproval', name: 'Mortgage pre-approval', description: 'An illustrative eligibility task with human approval retained.', traceID: '0195f0c0-7a11-7a22-9b42-000000000002',
    hops: [
      ['retail-mortgage-01', 'Receive and classify mortgage application', 'ok', 288],
      ['risk-credit-01', 'Calculate scenario credit score', 'ok', 504],
      ['risk-regulatory-01', 'Check evidence and suitability requirements', 'ok', 321],
      ['risk-fraud-01', 'Evaluate application risk signals', 'review', 409],
      ['retail-advisor-01', 'Prepare recommendation for advisor approval', 'ok', 346]
    ]
  },
  {
    id: 'sentiment-recovery', name: 'Customer sentiment recovery', description: 'A service-recovery task triggered from sample feedback.', traceID: '0195f0c0-7a11-7a23-aa53-000000000003',
    hops: [
      ['retail-sentiment-01', 'Classify negative feedback signal', 'ok', 173],
      ['retail-advisor-01', 'Summarise relevant customer context', 'ok', 297],
      ['head-retail', 'Assign follow-up to service team', 'ok', 164],
      ['retail-onboarding-01', 'Prepare governed service-recovery option', 'review', 238],
      ['head-it', 'Record workflow outcome in service system', 'ok', 129]
    ]
  },
  {
    id: 'cib-structuring', name: 'CIB product structuring', description: 'A sample product-design task with pricing and compliance review.', traceID: '0195f0c0-7a11-7a24-bb64-000000000004',
    hops: [
      ['head-cib', 'Validate structuring request and route work', 'ok', 216],
      ['cib-structuring-01', 'Prepare product structure from approved terms', 'ok', 581],
      ['cib-market-data-01', 'Retrieve governed market-data inputs', 'ok', 438],
      ['risk-regulatory-01', 'Evaluate MiFID II and EMIR evidence', 'review', 354],
      ['cib-trade-exec-01', 'Prepare best-execution checklist', 'ok', 391],
      ['cib-research-01', 'Draft client summary for human review', 'ok', 274]
    ]
  }
];

function buildEvents(seed, scenarioIndex) {
  const start = Date.parse(snapshot.capturedAt) - (scenarioIndex + 1) * 3600000;
  const base = [
    { stage: 'Entrypoint', operation: 'Accept task request', outcome: 'ok', duration: 34 },
    { stage: 'Event Broker', operation: 'Publish task event', outcome: 'ok', duration: 18 }
  ];
  const hops = seed.hops.map(([agentId, operation, outcome, duration]) => ({ stage: 'Agent / Workflow', operation, outcome, duration, agentId }));
  const tail = [
    { stage: 'Secure Tool Runtime', operation: 'Apply tool policy and runtime controls', outcome: 'ok', duration: 46 },
    { stage: 'Tool', operation: 'Commit approved task result', outcome: 'ok', duration: 91 }
  ];
  let elapsed = 0;
  return Object.freeze([...base, ...hops, ...tail].map((event, index) => {
    elapsed += event.duration;
    return Object.freeze({ ...event, id: `${seed.id}-event-${index + 1}`, timestamp: new Date(start + elapsed).toISOString(), traceID: seed.traceID });
  }));
}

export const workflows = Object.freeze(workflowSeeds.map((seed, index) => Object.freeze({ ...seed, events: buildEvents(seed, index) })));

export const costAssumptions = Object.freeze({
  period: snapshot.period,
  executionVolume: agents.reduce((sum, agent) => sum + agent.telemetry.executions, 0),
  platformUnitCosts: Object.freeze({ databricks: 0.037, salesforce: 0.043, mistral: 0.061, claude: 0.094 }),
  platformSubscription: 12000,
  baseline: Object.freeze({ integration: 32800, operations: 22800, governance: 18400, manualReview: 19000 }),
  disclaimer: 'Illustrative scenario calculation, not Solace pricing or a commercial estimate.'
});

export const monthlyCostTrend = Object.freeze([
  { month: 'Nov', compute: 10020, tokens: 9200, governance: 2780 },
  { month: 'Dec', compute: 9340, tokens: 8410, governance: 2450 },
  { month: 'Jan', compute: 8660, tokens: 7680, governance: 2160 },
  { month: 'Feb', compute: 8150, tokens: 6980, governance: 1970 },
  { month: 'Mar', compute: 7580, tokens: 6570, governance: 1850 },
  { month: 'Apr', compute: 8200, tokens: 7060, governance: 1903 }
]);

export const observability = Object.freeze({
  instruments: Object.freeze([
    ['sam.operation.duration', 'Duration', 'Core operation latency'],
    ['sam.gen_ai.client.operation.duration', 'Duration', 'Model client operation latency'],
    ['sam.gen_ai.client.operation.ttft.duration', 'Duration', 'Time to first token'],
    ['sam.gen_ai.tokens.used', 'Counter', 'Input and output token usage'],
    ['sam.gen_ai.cost.total', 'Counter', 'Estimated model cost'],
    ['sam.entrypoint.duration', 'Duration', 'Entrypoint request duration'],
    ['sam.entrypoint.ttfb.duration', 'Duration', 'Entrypoint time to first byte'],
    ['sam.entrypoint.requests', 'Counter', 'Entrypoint request count'],
    ['sam.outbound.request.duration', 'Duration', 'Outbound request latency'],
    ['sam.component.count', 'Gauge', 'Registered component count'],
    ['sam.instance.up', 'Gauge', 'Instance liveness signal']
  ].map(([name, type, description]) => Object.freeze({ name, type, description }))),
  health: Object.freeze([
    { layer: 'Listener liveness', signal: 'Process listener responds', status: 'healthy', detail: 'Shows that the listener process can answer; it does not prove broker readiness.' },
    { layer: 'Management health', signal: 'Management endpoint responds', status: 'healthy', detail: 'Shows management-plane reachability, separately from task execution.' },
    { layer: 'Runtime readiness', signal: 'Runtime ready and broker connected', status: 'degraded', detail: 'One sample runtime reports reconnecting while remaining alive.' },
    { layer: 'Workload health', signal: 'Task outcomes and latency', status: 'warning', detail: 'Scenario p95 latency is above its illustrative operating threshold.' },
    { layer: 'Individual agent series', signal: 'Recent metric series present', status: 'healthy', detail: 'Series presence is evidence of export, not agent-card availability.' },
    { layer: 'Agent-card availability', signal: 'Discovery card can be resolved', status: 'healthy', detail: 'Discovery metadata is available for the selected sample agents.' }
  ]),
  logRecords: Object.freeze([
    { timestamp: '2026-04-30T15:59:42.184Z', level: 'INFO', component: 'entrypoint', operation: 'task.accept', traceID: workflowSeeds[0].traceID, message: 'Task request accepted for scenario replay.' },
    { timestamp: '2026-04-30T15:59:42.231Z', level: 'INFO', component: 'broker', operation: 'event.publish', traceID: workflowSeeds[0].traceID, message: 'Task event published to workflow route.' },
    { timestamp: '2026-04-30T15:59:43.118Z', level: 'WARN', component: 'runtime', operation: 'policy.review', traceID: workflowSeeds[0].traceID, message: 'Screening result requires human review.' },
    { timestamp: '2026-04-30T15:59:43.295Z', level: 'INFO', component: 'tool-runtime', operation: 'tool.authorize', traceID: workflowSeeds[0].traceID, message: 'Approved tool invocation passed runtime policy.' },
    { timestamp: '2026-04-30T15:59:43.421Z', level: 'INFO', component: 'workflow', operation: 'task.complete', traceID: workflowSeeds[0].traceID, message: 'Scenario task event trail completed.' },
    { timestamp: '2026-04-30T14:58:08.411Z', level: 'ERROR', component: 'broker', operation: 'connection.retry', traceID: workflowSeeds[3].traceID, message: 'Sample runtime entered broker reconnect backoff.' }
  ]),
  trend: Object.freeze([
    { time: '10:00', requests: 312, p95: 682, errors: 5 }, { time: '11:00', requests: 348, p95: 641, errors: 4 },
    { time: '12:00', requests: 371, p95: 724, errors: 7 }, { time: '13:00', requests: 356, p95: 695, errors: 6 },
    { time: '14:00', requests: 402, p95: 788, errors: 9 }, { time: '15:00', requests: 438, p95: 742, errors: 7 },
    { time: '16:00', requests: 421, p95: 716, errors: 6 }
  ])
});

export function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = typeof key === 'function' ? key(item) : item[key];
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

export function sumBy(items, key) {
  return items.reduce((sum, item) => sum + (typeof key === 'function' ? key(item) : item[key]), 0);
}

export const modelCounts = Object.freeze({
  total: agents.length,
  roles: Object.freeze(countBy(agents, 'role')),
  domains: Object.freeze(countBy(agents.filter(agent => agent.domain !== 'group'), 'domain')),
  platforms: Object.freeze(countBy(agents, 'platform')),
  audiences: Object.freeze(countBy(agents, 'audience'))
});

function assertModel() {
  const expectedPlatforms = { databricks: 31, salesforce: 14, mistral: 23, claude: 21 };
  console.assert(agents.length === 89, `Expected 89 agents, received ${agents.length}`);
  console.assert(new Set(agents.map(agent => agent.id)).size === agents.length, 'Agent IDs must be unique');
  console.assert(modelCounts.roles.orchestrator === 1 && modelCounts.roles.head === 4 && modelCounts.roles.specialist === 84, 'Role counts are invalid');
  DOMAIN_ORDER.forEach(domain => console.assert(modelCounts.domains[domain] === 22, `${domain} must contain 22 agents`));
  PLATFORM_ORDER.forEach(platform => console.assert(modelCounts.platforms[platform] === expectedPlatforms[platform], `${platform} count is invalid`));
  workflows.forEach(workflow => workflow.events.forEach(event => {
    if (event.agentId) console.assert(agentById.has(event.agentId), `Unknown workflow agent ${event.agentId}`);
    console.assert(event.traceID === workflow.traceID, `Event traceID changed in ${workflow.id}`);
  }));
}

assertModel();

export { DOMAIN_ORDER, PLATFORM_ORDER };
