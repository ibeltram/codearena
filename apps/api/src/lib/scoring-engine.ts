/**
 * Scoring Engine
 *
 * Evaluates submissions against rubric criteria with:
 * - Test file pattern matching to requirements
 * - JUnit XML and TAP test result parsing
 * - Coverage report parsing
 * - Lint result parsing
 * - Weighted score calculation
 * - Partial credit support
 * - Evidence collection for each requirement
 */

/**
 * Simple glob pattern matcher
 * Supports: *, **, ?, and [...]
 */
function globMatch(path: string, pattern: string, options?: { matchBase?: boolean; nocase?: boolean }): boolean {
  // Normalize paths
  let p = path;
  let pat = pattern;

  if (options?.nocase) {
    p = p.toLowerCase();
    pat = pat.toLowerCase();
  }

  // If matchBase is true and pattern has no slashes, match against basename
  if (options?.matchBase && !pat.includes('/')) {
    const basename = p.split('/').pop() || p;
    p = basename;
  }

  // Convert glob pattern to regex
  let regex = '';
  let i = 0;

  while (i < pat.length) {
    const c = pat[i];

    if (c === '*') {
      if (pat[i + 1] === '*') {
        // ** matches any path including /
        regex += '.*';
        i += 2;
        // Skip trailing / after **
        if (pat[i] === '/') i++;
      } else {
        // * matches anything except /
        regex += '[^/]*';
        i++;
      }
    } else if (c === '?') {
      // ? matches single char except /
      regex += '[^/]';
      i++;
    } else if (c === '[') {
      // Character class
      const end = pat.indexOf(']', i);
      if (end === -1) {
        regex += '\\[';
        i++;
      } else {
        regex += pat.slice(i, end + 1);
        i = end + 1;
      }
    } else if (c === '.' || c === '(' || c === ')' || c === '+' || c === '^' || c === '$' || c === '|' || c === '\\') {
      // Escape regex special chars
      regex += '\\' + c;
      i++;
    } else {
      regex += c;
      i++;
    }
  }

  try {
    return new RegExp(`^${regex}$`).test(p);
  } catch {
    return false;
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Requirement from the rubric schema
 */
export interface RubricRequirement {
  id: string;
  title: string;
  description: string;
  weight: number;               // 0-100, must sum to 100 across all requirements
  evidence: string[];           // Evidence types: 'screenshots_optional', 'dom_structure', 'build_log', etc.
  tests: string[];              // Test file patterns: ['layout.spec.ts', '**/*.test.ts']
}

/**
 * Full rubric configuration
 */
export interface RubricConfig {
  requirements: RubricRequirement[];
  tieBreakers: string[];        // Order of tie-breakers: ['tests_passed', 'critical_errors', 'submit_time']
  buildCommand?: string;
  testCommand?: string;
  lintCommand?: string;
}

/**
 * Individual test case result
 */
export interface TestCase {
  name: string;
  className?: string;
  file?: string;
  duration?: number;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  errorMessage?: string;
  errorType?: string;
  stackTrace?: string;
}

/**
 * Test suite result (collection of test cases)
 */
export interface TestSuite {
  name: string;
  file?: string;
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
  duration?: number;
  testCases: TestCase[];
}

/**
 * Overall test results
 */
export interface TestResults {
  suites: TestSuite[];
  totalTests: number;
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  totalErrors: number;
  duration?: number;
}

/**
 * Coverage data for a file
 */
export interface FileCoverage {
  file: string;
  lines: { covered: number; total: number; percentage: number };
  branches: { covered: number; total: number; percentage: number };
  functions: { covered: number; total: number; percentage: number };
  statements: { covered: number; total: number; percentage: number };
}

/**
 * Overall coverage report
 */
export interface CoverageReport {
  files: FileCoverage[];
  summary: {
    lines: { covered: number; total: number; percentage: number };
    branches: { covered: number; total: number; percentage: number };
    functions: { covered: number; total: number; percentage: number };
    statements: { covered: number; total: number; percentage: number };
  };
}

/**
 * Lint issue
 */
export interface LintIssue {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  rule?: string;
  message: string;
}

/**
 * Lint results
 */
export interface LintResults {
  issues: LintIssue[];
  errorCount: number;
  warningCount: number;
  fixableErrorCount: number;
  fixableWarningCount: number;
}

/**
 * Build result
 */
export interface BuildResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  errors: string[];
  warnings: string[];
}

/**
 * Evidence collected for a requirement
 */
export interface RequirementEvidence {
  type: string;
  data: unknown;
  summary: string;
}

/**
 * Score result for a single requirement
 */
export interface RequirementScore {
  requirementId: string;
  title: string;
  score: number;              // 0-100 normalized score for this requirement
  weightedScore: number;      // score * weight / 100
  weight: number;
  maxScore: number;           // Always 100 (normalized)
  evidence: RequirementEvidence[];
  details: {
    testsMatched: number;
    testsPassed: number;
    testsFailed: number;
    testsSkipped: number;
    coveragePercentage?: number;
    lintErrors?: number;
    lintWarnings?: number;
    buildSuccess?: boolean;
  };
}

/**
 * Overall scoring result
 */
export interface ScoringResult {
  totalScore: number;         // Sum of weighted scores (0-100)
  maxScore: number;           // Always 100
  requirements: RequirementScore[];
  buildResult?: BuildResult;
  testResults?: TestResults;
  coverageReport?: CoverageReport;
  lintResults?: LintResults;
  tieBreakers: {
    testsPassed: number;
    criticalErrors: number;
    submitTime?: Date;
  };
  metadata: {
    scoredAt: Date;
    engineVersion: string;
    duration: number;
  };
}

// ============================================================================
// Parsers
// ============================================================================

/**
 * Parse JUnit XML test results
 */
export function parseJUnitXML(xml: string): TestResults {
  const suites: TestSuite[] = [];
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalDuration = 0;

  // Simple regex-based parsing (in production, use a proper XML parser)
  const testsuiteRegex = /<testsuite[^>]*name="([^"]*)"[^>]*tests="(\d+)"[^>]*(?:failures="(\d+)")?[^>]*(?:errors="(\d+)")?[^>]*(?:skipped="(\d+)")?[^>]*(?:time="([^"]*)")?[^>]*>/g;
  const testcaseRegex = /<testcase[^>]*name="([^"]*)"[^>]*(?:classname="([^"]*)")?[^>]*(?:time="([^"]*)")?[^>]*(\/?>|>[\s\S]*?<\/testcase>)/g;
  const failureRegex = /<failure[^>]*(?:type="([^"]*)")?[^>]*(?:message="([^"]*)")?[^>]*>([\s\S]*?)<\/failure>/;
  const errorRegex = /<error[^>]*(?:type="([^"]*)")?[^>]*(?:message="([^"]*)")?[^>]*>([\s\S]*?)<\/error>/;
  const skippedRegex = /<skipped[^>]*(?:message="([^"]*)")?/;

  // Match testsuites
  let suiteMatch;
  while ((suiteMatch = testsuiteRegex.exec(xml)) !== null) {
    const suiteName = suiteMatch[1];
    const tests = parseInt(suiteMatch[2], 10) || 0;
    const failures = parseInt(suiteMatch[3], 10) || 0;
    const errors = parseInt(suiteMatch[4], 10) || 0;
    const skipped = parseInt(suiteMatch[5], 10) || 0;
    const duration = parseFloat(suiteMatch[6]) || 0;

    const suite: TestSuite = {
      name: suiteName,
      tests,
      passed: tests - failures - errors - skipped,
      failed: failures,
      skipped,
      errors,
      duration,
      testCases: [],
    };

    suites.push(suite);
    totalTests += tests;
    totalPassed += suite.passed;
    totalFailed += failures;
    totalSkipped += skipped;
    totalErrors += errors;
    totalDuration += duration;
  }

  // If no testsuites found, try parsing testcases directly
  if (suites.length === 0) {
    const suite: TestSuite = {
      name: 'default',
      tests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: 0,
      testCases: [],
    };

    let caseMatch;
    while ((caseMatch = testcaseRegex.exec(xml)) !== null) {
      const caseName = caseMatch[1];
      const className = caseMatch[2];
      const duration = parseFloat(caseMatch[3]) || 0;
      const caseContent = caseMatch[4];

      let status: TestCase['status'] = 'passed';
      let errorMessage: string | undefined;
      let errorType: string | undefined;
      let stackTrace: string | undefined;

      if (caseContent.includes('<failure') || failureRegex.test(caseContent)) {
        status = 'failed';
        const failMatch = failureRegex.exec(caseContent);
        if (failMatch) {
          errorType = failMatch[1];
          errorMessage = failMatch[2];
          stackTrace = failMatch[3]?.trim();
        }
      } else if (caseContent.includes('<error') || errorRegex.test(caseContent)) {
        status = 'error';
        const errMatch = errorRegex.exec(caseContent);
        if (errMatch) {
          errorType = errMatch[1];
          errorMessage = errMatch[2];
          stackTrace = errMatch[3]?.trim();
        }
      } else if (caseContent.includes('<skipped') || skippedRegex.test(caseContent)) {
        status = 'skipped';
      }

      const testCase: TestCase = {
        name: caseName,
        className,
        duration,
        status,
        errorMessage,
        errorType,
        stackTrace,
      };

      suite.testCases.push(testCase);
      suite.tests++;

      switch (status) {
        case 'passed':
          suite.passed++;
          totalPassed++;
          break;
        case 'failed':
          suite.failed++;
          totalFailed++;
          break;
        case 'skipped':
          suite.skipped++;
          totalSkipped++;
          break;
        case 'error':
          suite.errors++;
          totalErrors++;
          break;
      }
      totalTests++;
    }

    if (suite.tests > 0) {
      suites.push(suite);
    }
  }

  return {
    suites,
    totalTests,
    totalPassed,
    totalFailed,
    totalSkipped,
    totalErrors,
    duration: totalDuration,
  };
}

/**
 * Parse TAP (Test Anything Protocol) output
 */
export function parseTAP(output: string): TestResults {
  const lines = output.split('\n');
  const testCases: TestCase[] = [];
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  // TAP plan line: 1..N
  const planMatch = output.match(/^1\.\.(\d+)/m);
  if (planMatch) {
    totalTests = parseInt(planMatch[1], 10);
  }

  // Parse test lines
  const testLineRegex = /^(ok|not ok)\s+(\d+)?\s*(-\s*)?(.*)$/;
  const skipRegex = /# (SKIP|TODO)\s*(.*)?$/i;

  for (const line of lines) {
    const match = testLineRegex.exec(line.trim());
    if (match) {
      const passed = match[1] === 'ok';
      const testNumber = match[2] ? parseInt(match[2], 10) : testCases.length + 1;
      const description = match[4] || `Test ${testNumber}`;

      let status: TestCase['status'];
      let errorMessage: string | undefined;

      const skipMatch = skipRegex.exec(description);
      if (skipMatch) {
        status = 'skipped';
        totalSkipped++;
      } else if (passed) {
        status = 'passed';
        totalPassed++;
      } else {
        status = 'failed';
        totalFailed++;
        errorMessage = `Test failed: ${description}`;
      }

      testCases.push({
        name: description.replace(skipRegex, '').trim(),
        status,
        errorMessage,
      });
    }
  }

  // Update totalTests if we found more tests than the plan
  if (testCases.length > totalTests) {
    totalTests = testCases.length;
  }

  return {
    suites: [{
      name: 'TAP Results',
      tests: totalTests,
      passed: totalPassed,
      failed: totalFailed,
      skipped: totalSkipped,
      errors: 0,
      testCases,
    }],
    totalTests,
    totalPassed,
    totalFailed,
    totalSkipped,
    totalErrors: 0,
  };
}

/**
 * Parse Jest/Vitest JSON output
 */
export function parseJestJSON(json: string): TestResults {
  try {
    const data = JSON.parse(json);
    const suites: TestSuite[] = [];
    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    // Handle Jest-style output
    if (data.testResults) {
      for (const result of data.testResults) {
        const suite: TestSuite = {
          name: result.name || 'Unknown',
          file: result.name,
          tests: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          errors: 0,
          duration: result.endTime ? result.endTime - result.startTime : undefined,
          testCases: [],
        };

        if (result.assertionResults) {
          for (const assertion of result.assertionResults) {
            const status = assertion.status === 'passed' ? 'passed'
              : assertion.status === 'failed' ? 'failed'
              : assertion.status === 'pending' ? 'skipped'
              : 'error';

            suite.testCases.push({
              name: assertion.title || assertion.fullName,
              status,
              duration: assertion.duration,
              errorMessage: assertion.failureMessages?.join('\n'),
            });

            suite.tests++;
            switch (status) {
              case 'passed': suite.passed++; break;
              case 'failed': suite.failed++; break;
              case 'skipped': suite.skipped++; break;
              case 'error': suite.errors++; break;
            }
          }
        }

        suites.push(suite);
        totalTests += suite.tests;
        totalPassed += suite.passed;
        totalFailed += suite.failed;
        totalSkipped += suite.skipped;
      }
    }

    // Handle summary if available
    if (data.numTotalTests) {
      totalTests = data.numTotalTests;
      totalPassed = data.numPassedTests || 0;
      totalFailed = data.numFailedTests || 0;
      totalSkipped = data.numPendingTests || 0;
    }

    return {
      suites,
      totalTests,
      totalPassed,
      totalFailed,
      totalSkipped,
      totalErrors: 0,
      duration: data.testResults?.[0]?.endTime
        ? data.testResults[data.testResults.length - 1].endTime - data.testResults[0].startTime
        : undefined,
    };
  } catch {
    return {
      suites: [],
      totalTests: 0,
      totalPassed: 0,
      totalFailed: 0,
      totalSkipped: 0,
      totalErrors: 0,
    };
  }
}

/**
 * Parse Istanbul/NYC coverage JSON
 */
export function parseCoverageJSON(json: string): CoverageReport {
  try {
    const data = JSON.parse(json);
    const files: FileCoverage[] = [];
    let totalLines = 0;
    let coveredLines = 0;
    let totalBranches = 0;
    let coveredBranches = 0;
    let totalFunctions = 0;
    let coveredFunctions = 0;
    let totalStatements = 0;
    let coveredStatements = 0;

    // Handle NYC/Istanbul format
    for (const [filePath, fileData] of Object.entries(data)) {
      if (filePath === 'total' || typeof fileData !== 'object' || !fileData) continue;

      const file = fileData as Record<string, unknown>;

      // Count covered vs total
      const lineHits = file.l as Record<string, number> | undefined;
      const branchHits = file.b as Record<string, number[]> | undefined;
      const fnHits = file.f as Record<string, number> | undefined;
      const stmtHits = file.s as Record<string, number> | undefined;

      let fileLinesCovered = 0;
      let fileLinesTotal = 0;
      let fileBranchesCovered = 0;
      let fileBranchesTotal = 0;
      let fileFunctionsCovered = 0;
      let fileFunctionsTotal = 0;
      let fileStatementsCovered = 0;
      let fileStatementsTotal = 0;

      if (lineHits) {
        for (const hit of Object.values(lineHits)) {
          fileLinesTotal++;
          if (hit > 0) fileLinesCovered++;
        }
      }

      if (branchHits) {
        for (const hits of Object.values(branchHits)) {
          for (const hit of hits) {
            fileBranchesTotal++;
            if (hit > 0) fileBranchesCovered++;
          }
        }
      }

      if (fnHits) {
        for (const hit of Object.values(fnHits)) {
          fileFunctionsTotal++;
          if (hit > 0) fileFunctionsCovered++;
        }
      }

      if (stmtHits) {
        for (const hit of Object.values(stmtHits)) {
          fileStatementsTotal++;
          if (hit > 0) fileStatementsCovered++;
        }
      }

      files.push({
        file: filePath,
        lines: {
          covered: fileLinesCovered,
          total: fileLinesTotal,
          percentage: fileLinesTotal > 0 ? (fileLinesCovered / fileLinesTotal) * 100 : 0,
        },
        branches: {
          covered: fileBranchesCovered,
          total: fileBranchesTotal,
          percentage: fileBranchesTotal > 0 ? (fileBranchesCovered / fileBranchesTotal) * 100 : 0,
        },
        functions: {
          covered: fileFunctionsCovered,
          total: fileFunctionsTotal,
          percentage: fileFunctionsTotal > 0 ? (fileFunctionsCovered / fileFunctionsTotal) * 100 : 0,
        },
        statements: {
          covered: fileStatementsCovered,
          total: fileStatementsTotal,
          percentage: fileStatementsTotal > 0 ? (fileStatementsCovered / fileStatementsTotal) * 100 : 0,
        },
      });

      totalLines += fileLinesTotal;
      coveredLines += fileLinesCovered;
      totalBranches += fileBranchesTotal;
      coveredBranches += fileBranchesCovered;
      totalFunctions += fileFunctionsTotal;
      coveredFunctions += fileFunctionsCovered;
      totalStatements += fileStatementsTotal;
      coveredStatements += fileStatementsCovered;
    }

    return {
      files,
      summary: {
        lines: {
          covered: coveredLines,
          total: totalLines,
          percentage: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0,
        },
        branches: {
          covered: coveredBranches,
          total: totalBranches,
          percentage: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0,
        },
        functions: {
          covered: coveredFunctions,
          total: totalFunctions,
          percentage: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 0,
        },
        statements: {
          covered: coveredStatements,
          total: totalStatements,
          percentage: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0,
        },
      },
    };
  } catch {
    return {
      files: [],
      summary: {
        lines: { covered: 0, total: 0, percentage: 0 },
        branches: { covered: 0, total: 0, percentage: 0 },
        functions: { covered: 0, total: 0, percentage: 0 },
        statements: { covered: 0, total: 0, percentage: 0 },
      },
    };
  }
}

/**
 * Parse ESLint JSON output
 */
export function parseESLintJSON(json: string): LintResults {
  try {
    const data = JSON.parse(json) as Array<{
      filePath: string;
      messages: Array<{
        ruleId: string | null;
        severity: number;
        message: string;
        line: number;
        column: number;
        fix?: unknown;
      }>;
      errorCount: number;
      warningCount: number;
      fixableErrorCount: number;
      fixableWarningCount: number;
    }>;

    const issues: LintIssue[] = [];
    let errorCount = 0;
    let warningCount = 0;
    let fixableErrorCount = 0;
    let fixableWarningCount = 0;

    for (const file of data) {
      for (const msg of file.messages) {
        issues.push({
          file: file.filePath,
          line: msg.line,
          column: msg.column,
          severity: msg.severity === 2 ? 'error' : msg.severity === 1 ? 'warning' : 'info',
          rule: msg.ruleId || undefined,
          message: msg.message,
        });
      }
      errorCount += file.errorCount;
      warningCount += file.warningCount;
      fixableErrorCount += file.fixableErrorCount;
      fixableWarningCount += file.fixableWarningCount;
    }

    return {
      issues,
      errorCount,
      warningCount,
      fixableErrorCount,
      fixableWarningCount,
    };
  } catch {
    return {
      issues: [],
      errorCount: 0,
      warningCount: 0,
      fixableErrorCount: 0,
      fixableWarningCount: 0,
    };
  }
}

// ============================================================================
// Scoring Logic
// ============================================================================

/**
 * Match test files to a requirement based on patterns
 */
export function matchTestsToRequirement(
  testResults: TestResults,
  patterns: string[]
): TestCase[] {
  const matchedTests: TestCase[] = [];

  for (const suite of testResults.suites) {
    for (const testCase of suite.testCases) {
      // Try matching against the test file name, class name, or suite name
      const testFile = testCase.file || testCase.className || suite.file || suite.name;

      for (const pattern of patterns) {
        if (globMatch(testFile, pattern, { matchBase: true }) ||
            globMatch(testCase.name, `*${pattern}*`, { nocase: true })) {
          matchedTests.push(testCase);
          break;
        }
      }
    }
  }

  return matchedTests;
}

/**
 * Calculate score for a single requirement
 */
export function scoreRequirement(
  requirement: RubricRequirement,
  testResults?: TestResults,
  buildResult?: BuildResult,
  lintResults?: LintResults,
  coverageReport?: CoverageReport
): RequirementScore {
  const evidence: RequirementEvidence[] = [];
  let score = 0;

  // Determine scoring strategy based on evidence types
  const hasBuildEvidence = requirement.evidence.includes('build_log');
  const hasLintEvidence = requirement.evidence.includes('lint_log');
  const hasTestEvidence = requirement.tests.length > 0;
  const hasCoverageEvidence = requirement.evidence.includes('coverage');

  let testsMatched = 0;
  let testsPassed = 0;
  let testsFailed = 0;
  let testsSkipped = 0;
  let coveragePercentage: number | undefined;
  let lintErrors: number | undefined;
  let lintWarnings: number | undefined;
  let buildSuccess: boolean | undefined;

  // Score based on tests
  if (hasTestEvidence && testResults) {
    const matchedTests = matchTestsToRequirement(testResults, requirement.tests);
    testsMatched = matchedTests.length;
    testsPassed = matchedTests.filter(t => t.status === 'passed').length;
    testsFailed = matchedTests.filter(t => t.status === 'failed').length;
    testsSkipped = matchedTests.filter(t => t.status === 'skipped').length;

    if (testsMatched > 0) {
      // Score based on pass rate (excluding skipped)
      const activeTests = testsMatched - testsSkipped;
      if (activeTests > 0) {
        score = (testsPassed / activeTests) * 100;
      }

      evidence.push({
        type: 'test_results',
        data: { matched: testsMatched, passed: testsPassed, failed: testsFailed, skipped: testsSkipped },
        summary: `${testsPassed}/${testsMatched} tests passed`,
      });
    }
  }

  // Score based on build success
  if (hasBuildEvidence && buildResult) {
    buildSuccess = buildResult.success;
    if (buildResult.success) {
      // If tests aren't the primary evidence, use build success
      if (!hasTestEvidence || testsMatched === 0) {
        score = 100;
      }
    } else {
      // Build failure significantly impacts score
      score = Math.min(score, 25); // Cap at 25% if build fails
    }

    evidence.push({
      type: 'build_log',
      data: { success: buildResult.success, exitCode: buildResult.exitCode },
      summary: buildResult.success ? 'Build successful' : `Build failed (exit ${buildResult.exitCode})`,
    });
  }

  // Score based on lint results
  if (hasLintEvidence && lintResults) {
    lintErrors = lintResults.errorCount;
    lintWarnings = lintResults.warningCount;

    // Deduct points for lint errors
    if (lintErrors > 0) {
      const lintPenalty = Math.min(lintErrors * 5, 50); // Max 50% penalty
      score = Math.max(0, score - lintPenalty);
    }

    evidence.push({
      type: 'lint_log',
      data: { errors: lintErrors, warnings: lintWarnings },
      summary: lintErrors === 0 ? 'No lint errors' : `${lintErrors} lint errors`,
    });
  }

  // Add coverage bonus if available
  if (hasCoverageEvidence && coverageReport) {
    coveragePercentage = coverageReport.summary.lines.percentage;

    // Bonus for high coverage (up to 10% bonus)
    if (coveragePercentage >= 80) {
      score = Math.min(100, score + 10);
    } else if (coveragePercentage >= 60) {
      score = Math.min(100, score + 5);
    }

    evidence.push({
      type: 'coverage',
      data: coverageReport.summary,
      summary: `${coveragePercentage.toFixed(1)}% line coverage`,
    });
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    requirementId: requirement.id,
    title: requirement.title,
    score,
    weightedScore: (score * requirement.weight) / 100,
    weight: requirement.weight,
    maxScore: 100,
    evidence,
    details: {
      testsMatched,
      testsPassed,
      testsFailed,
      testsSkipped,
      coveragePercentage,
      lintErrors,
      lintWarnings,
      buildSuccess,
    },
  };
}

/**
 * Calculate overall score for a submission
 */
export function calculateScore(
  rubric: RubricConfig,
  testResults?: TestResults,
  buildResult?: BuildResult,
  lintResults?: LintResults,
  coverageReport?: CoverageReport,
  submitTime?: Date
): ScoringResult {
  const startTime = Date.now();
  const requirementScores: RequirementScore[] = [];

  // Score each requirement
  for (const requirement of rubric.requirements) {
    const reqScore = scoreRequirement(
      requirement,
      testResults,
      buildResult,
      lintResults,
      coverageReport
    );
    requirementScores.push(reqScore);
  }

  // Calculate total weighted score
  const totalScore = requirementScores.reduce((sum, r) => sum + r.weightedScore, 0);

  // Calculate tie-breaker values
  const tieBreakers = {
    testsPassed: testResults?.totalPassed || 0,
    criticalErrors: (lintResults?.errorCount || 0) + (buildResult?.success === false ? 10 : 0),
    submitTime,
  };

  return {
    totalScore: Math.round(totalScore),
    maxScore: 100,
    requirements: requirementScores,
    buildResult,
    testResults,
    coverageReport,
    lintResults,
    tieBreakers,
    metadata: {
      scoredAt: new Date(),
      engineVersion: '1.0.0',
      duration: Date.now() - startTime,
    },
  };
}

/**
 * Compare two scores for tie-breaking
 * Returns:
 *  - negative if a wins
 *  - positive if b wins
 *  - 0 if still tied
 */
export function compareTieBreakers(
  a: ScoringResult,
  b: ScoringResult,
  order: string[] = ['tests_passed', 'critical_errors', 'submit_time']
): number {
  for (const criterion of order) {
    switch (criterion) {
      case 'tests_passed':
        // More tests passed wins
        const testDiff = b.tieBreakers.testsPassed - a.tieBreakers.testsPassed;
        if (testDiff !== 0) return testDiff;
        break;

      case 'critical_errors':
        // Fewer errors wins (negative is better for a)
        const errorDiff = a.tieBreakers.criticalErrors - b.tieBreakers.criticalErrors;
        if (errorDiff !== 0) return errorDiff;
        break;

      case 'submit_time':
        // Earlier submit wins
        if (a.tieBreakers.submitTime && b.tieBreakers.submitTime) {
          const timeDiff = a.tieBreakers.submitTime.getTime() - b.tieBreakers.submitTime.getTime();
          if (timeDiff !== 0) return timeDiff;
        }
        break;
    }
  }

  return 0; // Still tied
}

/**
 * Determine winner between two participants
 */
export function determineWinner(
  scoreA: ScoringResult,
  scoreB: ScoringResult,
  tieBreakers: string[] = ['tests_passed', 'critical_errors', 'submit_time']
): 'A' | 'B' | 'tie' {
  // First compare total scores
  if (scoreA.totalScore > scoreB.totalScore) return 'A';
  if (scoreB.totalScore > scoreA.totalScore) return 'B';

  // Scores are equal, use tie-breakers
  const comparison = compareTieBreakers(scoreA, scoreB, tieBreakers);
  if (comparison < 0) return 'A';
  if (comparison > 0) return 'B';

  return 'tie';
}
