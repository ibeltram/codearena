/**
 * AI Judge Service
 *
 * Evaluates code quality and rubric compliance using LLM.
 * Features:
 * - Enabled per challenge version
 * - Constrained prompts with rubric criteria only
 * - Structured JSON responses for scores
 * - Reasoning stored as evidence
 * - Support for multiple LLM providers (OpenAI, Anthropic, etc.)
 */

import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

/**
 * AI Judge configuration per challenge version
 */
export interface AIJudgeConfig {
  enabled: boolean;
  provider: 'openai' | 'anthropic' | 'mock';
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;  // Custom system prompt override
}

/**
 * Rubric requirement for AI judge evaluation
 */
export interface AIJudgeRequirement {
  id: string;
  title: string;
  description: string;
  weight: number;
  criteria: string[];       // Specific criteria to evaluate
  evidenceTypes: string[];  // What evidence to look for
}

/**
 * Code context for AI evaluation
 */
export interface CodeContext {
  files: Array<{
    path: string;
    content: string;
    language: string;
  }>;
  metadata?: {
    framework?: string;
    language?: string;
    buildOutput?: string;
    testOutput?: string;
  };
}

/**
 * Single criterion evaluation result
 */
export interface CriterionResult {
  criterion: string;
  met: boolean;
  score: number;        // 0-100
  reasoning: string;
  evidence?: string[];  // File paths or code snippets as evidence
}

/**
 * AI Judge evaluation result for a requirement
 */
export interface AIJudgeRequirementResult {
  requirementId: string;
  title: string;
  score: number;              // 0-100 normalized
  weightedScore: number;      // score * weight / 100
  weight: number;
  criteria: CriterionResult[];
  overallReasoning: string;
  confidence: number;         // 0-1, how confident the AI is in its evaluation
  evaluatedAt: Date;
}

/**
 * Overall AI Judge evaluation result
 */
export interface AIJudgeResult {
  requirements: AIJudgeRequirementResult[];
  totalScore: number;
  maxScore: number;
  summary: string;
  metadata: {
    provider: string;
    model: string;
    evaluatedAt: Date;
    durationMs: number;
    tokensUsed?: number;
  };
}

// ============================================================================
// Response Schema (for structured outputs)
// ============================================================================

const criterionResultSchema = z.object({
  criterion: z.string(),
  met: z.boolean(),
  score: z.number().min(0).max(100),
  reasoning: z.string(),
  evidence: z.array(z.string()).optional(),
});

const requirementEvaluationSchema = z.object({
  requirementId: z.string(),
  score: z.number().min(0).max(100),
  criteria: z.array(criterionResultSchema),
  overallReasoning: z.string(),
  confidence: z.number().min(0).max(1),
});

const aiJudgeResponseSchema = z.object({
  requirements: z.array(requirementEvaluationSchema),
  summary: z.string(),
});

type AIJudgeResponse = z.infer<typeof aiJudgeResponseSchema>;

// ============================================================================
// LLM Provider Clients
// ============================================================================

interface LLMClient {
  evaluate(prompt: string, systemPrompt: string): Promise<{ content: string; tokensUsed?: number }>;
}

/**
 * OpenAI client implementation
 */
class OpenAIClient implements LLMClient {
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: { apiKey: string; model?: string; maxTokens?: number; temperature?: number }) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'gpt-4o';
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature || 0.2;
  }

  async evaluate(prompt: string, systemPrompt: string): Promise<{ content: string; tokensUsed?: number }> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { total_tokens: number };
    };

    return {
      content: data.choices[0]?.message?.content || '',
      tokensUsed: data.usage?.total_tokens,
    };
  }
}

/**
 * Anthropic client implementation
 */
class AnthropicClient implements LLMClient {
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: { apiKey: string; model?: string; maxTokens?: number; temperature?: number }) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'claude-3-5-sonnet-20241022';
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature || 0.2;
  }

  async evaluate(prompt: string, systemPrompt: string): Promise<{ content: string; tokensUsed?: number }> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: systemPrompt,
        messages: [
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };

    const textContent = data.content.find(c => c.type === 'text');
    return {
      content: textContent?.text || '',
      tokensUsed: data.usage ? data.usage.input_tokens + data.usage.output_tokens : undefined,
    };
  }
}

/**
 * Mock client for testing
 */
class MockLLMClient implements LLMClient {
  async evaluate(_prompt: string, _systemPrompt: string): Promise<{ content: string; tokensUsed?: number }> {
    // Return a mock response that matches our schema
    const mockResponse: AIJudgeResponse = {
      requirements: [
        {
          requirementId: 'R1',
          score: 85,
          criteria: [
            {
              criterion: 'Code quality',
              met: true,
              score: 90,
              reasoning: 'Code follows best practices with clear naming and modular structure.',
              evidence: ['src/index.ts', 'src/utils.ts'],
            },
            {
              criterion: 'Documentation',
              met: true,
              score: 80,
              reasoning: 'Functions are documented with JSDoc comments.',
            },
          ],
          overallReasoning: 'The submission demonstrates good code quality with proper documentation.',
          confidence: 0.85,
        },
      ],
      summary: 'Overall, the submission meets most requirements with good code quality.',
    };

    return {
      content: JSON.stringify(mockResponse),
      tokensUsed: 500,
    };
  }
}

// ============================================================================
// AI Judge Service
// ============================================================================

/**
 * Get LLM client based on provider
 */
function getLLMClient(config: AIJudgeConfig): LLMClient {
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  switch (config.provider) {
    case 'openai':
      if (!openaiKey) {
        console.warn('OPENAI_API_KEY not set, falling back to mock client');
        return new MockLLMClient();
      }
      return new OpenAIClient({
        apiKey: openaiKey,
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
      });

    case 'anthropic':
      if (!anthropicKey) {
        console.warn('ANTHROPIC_API_KEY not set, falling back to mock client');
        return new MockLLMClient();
      }
      return new AnthropicClient({
        apiKey: anthropicKey,
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
      });

    case 'mock':
    default:
      return new MockLLMClient();
  }
}

/**
 * Build system prompt for AI judge
 */
function buildSystemPrompt(config: AIJudgeConfig, requirements: AIJudgeRequirement[]): string {
  if (config.systemPrompt) {
    return config.systemPrompt;
  }

  const criteriaList = requirements.map(r =>
    `- ${r.title}: ${r.description}\n  Criteria: ${r.criteria.join(', ')}`
  ).join('\n');

  return `You are an expert code judge evaluating submissions for a coding challenge.

Your task is to evaluate the submitted code STRICTLY against the provided rubric criteria.
Do NOT evaluate anything outside the rubric - focus only on what is explicitly stated.

IMPORTANT GUIDELINES:
1. Be objective and consistent in your scoring
2. Provide specific evidence from the code for your evaluations
3. Each criterion should be scored 0-100 based on how well it's met
4. Include reasoning that references specific code patterns or locations
5. Be fair - give credit for partial completion
6. Do not penalize for style preferences unless explicitly in the rubric

RUBRIC REQUIREMENTS:
${criteriaList}

Respond with a JSON object matching this schema:
{
  "requirements": [
    {
      "requirementId": "string",
      "score": number (0-100),
      "criteria": [
        {
          "criterion": "string",
          "met": boolean,
          "score": number (0-100),
          "reasoning": "string",
          "evidence": ["file paths or code snippets"] (optional)
        }
      ],
      "overallReasoning": "string",
      "confidence": number (0-1)
    }
  ],
  "summary": "string"
}`;
}

/**
 * Build user prompt with code context
 */
function buildUserPrompt(
  requirements: AIJudgeRequirement[],
  codeContext: CodeContext
): string {
  // Format files for the prompt
  const filesSection = codeContext.files
    .slice(0, 20) // Limit to first 20 files to avoid token limits
    .map(f => `--- ${f.path} (${f.language}) ---\n${f.content.slice(0, 5000)}`) // Limit each file
    .join('\n\n');

  const metadataSection = codeContext.metadata
    ? `\nBuild Output: ${codeContext.metadata.buildOutput?.slice(0, 1000) || 'N/A'}
Test Output: ${codeContext.metadata.testOutput?.slice(0, 1000) || 'N/A'}`
    : '';

  return `Please evaluate the following code submission against these requirements:

${requirements.map(r => `
## ${r.id}: ${r.title}
${r.description}
Criteria to evaluate:
${r.criteria.map(c => `- ${c}`).join('\n')}
Evidence to look for: ${r.evidenceTypes.join(', ')}
`).join('\n')}

=== SUBMITTED CODE ===
${filesSection}
${metadataSection}

Evaluate each requirement and provide your assessment in the specified JSON format.`;
}

/**
 * Parse and validate AI response
 */
function parseAIResponse(responseText: string): AIJudgeResponse {
  try {
    // Try to extract JSON from the response (in case it's wrapped in markdown)
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    } else {
      // Try to find JSON object directly
      const jsonStart = responseText.indexOf('{');
      const jsonEnd = responseText.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        jsonStr = responseText.slice(jsonStart, jsonEnd + 1);
      }
    }

    const parsed = JSON.parse(jsonStr);
    return aiJudgeResponseSchema.parse(parsed);
  } catch (error) {
    console.error('Failed to parse AI response:', error);
    console.error('Response text:', responseText.slice(0, 500));

    // Return a fallback response
    return {
      requirements: [],
      summary: 'Failed to parse AI evaluation response',
    };
  }
}

/**
 * Evaluate code with AI judge
 */
export async function evaluateWithAIJudge(
  config: AIJudgeConfig,
  requirements: AIJudgeRequirement[],
  codeContext: CodeContext
): Promise<AIJudgeResult> {
  const startTime = Date.now();

  if (!config.enabled) {
    return {
      requirements: [],
      totalScore: 0,
      maxScore: 0,
      summary: 'AI judge not enabled for this challenge',
      metadata: {
        provider: config.provider,
        model: config.model || 'none',
        evaluatedAt: new Date(),
        durationMs: 0,
      },
    };
  }

  if (requirements.length === 0) {
    return {
      requirements: [],
      totalScore: 0,
      maxScore: 0,
      summary: 'No AI judge requirements to evaluate',
      metadata: {
        provider: config.provider,
        model: config.model || 'none',
        evaluatedAt: new Date(),
        durationMs: Date.now() - startTime,
      },
    };
  }

  const client = getLLMClient(config);
  const systemPrompt = buildSystemPrompt(config, requirements);
  const userPrompt = buildUserPrompt(requirements, codeContext);

  console.log('[AI Judge] Starting evaluation...');
  console.log(`[AI Judge] Provider: ${config.provider}, Model: ${config.model || 'default'}`);
  console.log(`[AI Judge] Evaluating ${requirements.length} requirements`);

  const response = await client.evaluate(userPrompt, systemPrompt);
  const parsed = parseAIResponse(response.content);

  // Map parsed results to our result type
  const requirementResults: AIJudgeRequirementResult[] = [];
  let totalScore = 0;

  for (const req of requirements) {
    const parsedReq = parsed.requirements.find(r => r.requirementId === req.id);

    if (parsedReq) {
      const weightedScore = (parsedReq.score * req.weight) / 100;
      totalScore += weightedScore;

      requirementResults.push({
        requirementId: req.id,
        title: req.title,
        score: parsedReq.score,
        weightedScore,
        weight: req.weight,
        criteria: parsedReq.criteria.map(c => ({
          criterion: c.criterion,
          met: c.met,
          score: c.score,
          reasoning: c.reasoning,
          evidence: c.evidence,
        })),
        overallReasoning: parsedReq.overallReasoning,
        confidence: parsedReq.confidence,
        evaluatedAt: new Date(),
      });
    } else {
      // Requirement not found in response - give 0 score
      requirementResults.push({
        requirementId: req.id,
        title: req.title,
        score: 0,
        weightedScore: 0,
        weight: req.weight,
        criteria: [],
        overallReasoning: 'No evaluation available',
        confidence: 0,
        evaluatedAt: new Date(),
      });
    }
  }

  const maxScore = requirements.reduce((sum, r) => sum + r.weight, 0);

  console.log(`[AI Judge] Evaluation complete. Score: ${Math.round(totalScore)}/${maxScore}`);

  return {
    requirements: requirementResults,
    totalScore: Math.round(totalScore),
    maxScore,
    summary: parsed.summary,
    metadata: {
      provider: config.provider,
      model: config.model || 'default',
      evaluatedAt: new Date(),
      durationMs: Date.now() - startTime,
      tokensUsed: response.tokensUsed,
    },
  };
}

/**
 * Extract code context from artifact files
 */
export function extractCodeContext(
  files: Map<string, Buffer>,
  buildOutput?: string,
  testOutput?: string
): CodeContext {
  const codeFiles: CodeContext['files'] = [];

  // File extensions to include
  const codeExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.rb', '.go', '.rs', '.java', '.kt',
    '.c', '.cpp', '.h', '.hpp', '.cs',
    '.html', '.css', '.scss', '.sass', '.less',
    '.json', '.yaml', '.yml', '.toml',
    '.md', '.txt',
  ]);

  // Skip directories
  const skipDirs = new Set([
    'node_modules', '.git', 'dist', 'build', '.next',
    'coverage', '__pycache__', '.venv', 'vendor',
  ]);

  for (const [path, content] of files) {
    // Skip if in ignored directory
    const pathParts = path.split('/');
    if (pathParts.some(p => skipDirs.has(p))) {
      continue;
    }

    // Get file extension
    const ext = '.' + path.split('.').pop()?.toLowerCase();
    if (!codeExtensions.has(ext)) {
      continue;
    }

    // Detect language from extension
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.kt': 'kotlin',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.html': 'html',
      '.css': 'css',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.md': 'markdown',
    };

    codeFiles.push({
      path,
      content: content.toString('utf-8'),
      language: languageMap[ext] || 'text',
    });
  }

  // Sort by path for consistency
  codeFiles.sort((a, b) => a.path.localeCompare(b.path));

  return {
    files: codeFiles,
    metadata: {
      buildOutput,
      testOutput,
    },
  };
}

/**
 * Default AI Judge configuration
 */
export const DEFAULT_AI_JUDGE_CONFIG: AIJudgeConfig = {
  enabled: false,
  provider: 'mock',
  model: undefined,
  maxTokens: 4096,
  temperature: 0.2,
};

/**
 * Check if AI judge is properly configured
 */
export function isAIJudgeConfigured(): boolean {
  return !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}
