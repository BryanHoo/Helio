/*
 * Codevisor's QuickJS bridge is adapted from @executor-js/runtime-quickjs and
 * @executor-js/codemode-core, originally published under the MIT License:
 *
 * Copyright (c) 2026 Rhys Sullivan
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { parse } from "@babel/parser"
import { transform } from "sucrase"

/// Turning the model's code into an executable source: fenced-block
/// extraction, callable recovery (parsed, then regex fallback), TypeScript
/// stripping, and the sandbox wrapper that exposes tools/log/emit.

const FENCED_CODE_BLOCK = /```(?:[^\n`]*)?\s*\n([\s\S]*?)```/i
const FUNCTION_DECLARATION = /^(?:async\s+)?function(?:\s+([a-zA-Z_$][a-zA-Z0-9_$]*))?\s*\(/
const CALLABLE_ERROR = "Code must evaluate to a function"

const extractCandidateSource = (code: string): string => {
  const trimmed = code.trim()
  if (trimmed.length === 0) return ""
  return (trimmed.match(FENCED_CODE_BLOCK)?.[1] ?? trimmed).trim()
}

const wrapCallableBody = (source: string): string =>
  [
    "const __fn = (",
    source,
    ");",
    `if (typeof __fn !== "function") throw new Error(${JSON.stringify(CALLABLE_ERROR)});`,
    "return await __fn();"
  ].join("\n")

const wrapNamedFunctionBody = (source: string, name: string): string =>
  [source, `return await ${name}();`].join("\n")

const wrapAnonymousFunctionBody = (source: string): string => `return await (${source})();`

interface SourceNode {
  readonly type: string
  readonly start?: number | null
  readonly end?: number | null
  readonly id?: { readonly name?: string | null } | null
  readonly expression?: unknown
}

const sliceNode = (source: string, node: SourceNode): string =>
  source.slice(node.start ?? 0, node.end ?? source.length)

const unwrapExpression = (expression: SourceNode): unknown => {
  switch (expression.type) {
    case "ParenthesizedExpression":
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSTypeAssertion":
    case "TSNonNullExpression":
    case "TSInstantiationExpression":
      return expression.expression === undefined
        ? expression
        : unwrapExpression(expression.expression as SourceNode)
    default:
      return expression
  }
}

const renderExportDefaultBody = (source: string, declaration: SourceNode): string => {
  if (declaration.type === "FunctionDeclaration") {
    const functionSource = sliceNode(source, declaration)
    const name = declaration.id?.name
    return name === undefined || name === null
      ? wrapAnonymousFunctionBody(functionSource)
      : wrapNamedFunctionBody(functionSource, name)
  }
  const expression = unwrapExpression(declaration) as { readonly type?: string }
  const expressionSource = sliceNode(source, declaration)
  return expression.type === "ArrowFunctionExpression" || expression.type === "FunctionExpression"
    ? wrapCallableBody(expressionSource)
    : `return (${expressionSource});`
}

const renderParsedBody = (source: string): string => {
  const program = parse(source, {
    sourceType: "module",
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    allowImportExportEverywhere: true,
    plugins: ["typescript"]
  }).program
  if (program.body.length !== 1) return source
  const statement = program.body[0]
  if (statement === undefined) return source
  switch (statement.type) {
    case "ExpressionStatement": {
      const expression = unwrapExpression(statement.expression as SourceNode) as {
        readonly type?: string
      }
      return expression.type === "ArrowFunctionExpression" ||
        expression.type === "FunctionExpression"
        ? wrapCallableBody(source)
        : source
    }
    case "FunctionDeclaration":
      return statement.id?.name === undefined
        ? source
        : wrapNamedFunctionBody(source, statement.id.name)
    case "ExportDefaultDeclaration":
      return renderExportDefaultBody(source, statement.declaration as SourceNode)
    default:
      return source
  }
}

const recoverExecutionBody = (code: string): string => {
  const source = extractCandidateSource(code)
  if (source.length === 0) return ""
  try {
    return renderParsedBody(source)
  } catch {
    const withoutDefaultExport = source.replace(/^export\s+default\s+/, "").trim()
    if (
      (withoutDefaultExport.startsWith("async") || withoutDefaultExport.startsWith("(")) &&
      withoutDefaultExport.includes("=>")
    ) {
      return wrapCallableBody(withoutDefaultExport)
    }
    const name = withoutDefaultExport.match(FUNCTION_DECLARATION)?.[1]
    if (FUNCTION_DECLARATION.test(withoutDefaultExport)) {
      return name === undefined
        ? wrapAnonymousFunctionBody(withoutDefaultExport)
        : wrapNamedFunctionBody(withoutDefaultExport, name)
    }
    return withoutDefaultExport
  }
}

const stripTypeScript = (code: string): string =>
  transform(code, {
    transforms: ["typescript"],
    disableESTransforms: true,
    keepUnusedImports: true
  }).code

export const buildExecutionSource = (code: string): string => {
  const body = stripTypeScript(recoverExecutionBody(code))
  return [
    '"use strict";',
    "const __invokeTool = __codevisor_invokeTool;",
    "const __log = __codevisor_log;",
    "try { delete globalThis.__codevisor_invokeTool; } catch {}",
    "try { delete globalThis.__codevisor_log; } catch {}",
    "const __format = (value) => {",
    "  if (typeof value === 'string') return value;",
    "  try { return JSON.stringify(value); } catch { return String(value); }",
    "};",
    "const __outputs = [];",
    "globalThis.__codevisor_outputs = __outputs;",
    "const __isToolFile = (value) => value && typeof value === 'object' && value._tag === 'ToolFile' && typeof value.mimeType === 'string' && value.encoding === 'base64' && typeof value.data === 'string' && typeof value.byteLength === 'number';",
    "const __isText = (value) => value && typeof value === 'object' && value.type === 'text' && typeof value.text === 'string';",
    "const __isImage = (value) => value && typeof value === 'object' && value.type === 'image' && typeof value.data === 'string' && typeof value.mimeType === 'string';",
    "const __isAudio = (value) => value && typeof value === 'object' && value.type === 'audio' && typeof value.data === 'string' && typeof value.mimeType === 'string';",
    "const __isResource = (value) => value && typeof value === 'object' && value.type === 'resource' && value.resource && typeof value.resource === 'object' && typeof value.resource.uri === 'string' && (typeof value.resource.text === 'string' || typeof value.resource.blob === 'string');",
    "const __isResourceLink = (value) => value && typeof value === 'object' && value.type === 'resource_link' && typeof value.uri === 'string' && typeof value.name === 'string';",
    "const __isContent = (value) => __isText(value) || __isImage(value) || __isAudio(value) || __isResource(value) || __isResourceLink(value);",
    "const emit = (value) => {",
    "  if (__isToolFile(value)) { __outputs.push({ type: 'file', file: value }); return; }",
    "  if (__isContent(value)) { __outputs.push({ type: 'content', content: value }); return; }",
    "  __outputs.push({ type: 'content', content: { type: 'text', text: value === undefined ? 'undefined' : value === null ? 'null' : __format(value) } });",
    "};",
    "const __callTool = (path, args = {}) => Promise.resolve(__invokeTool(path, args)).then((raw) => raw === undefined ? undefined : JSON.parse(raw));",
    "const __enumerationError = (path) => new Error((path.length === 0 ? 'tools' : 'tools.' + path.join('.')) + ' is a lazy proxy and cannot be enumerated. Use tools.search({ query: \"...\" }) to find tools.');",
    "const __makeToolsProxy = (path = []) => new Proxy(() => undefined, {",
    "  get(_target, prop) {",
    "    if (prop === 'then' || typeof prop === 'symbol') return undefined;",
    "    const nextPath = [...path, String(prop)];",
    "    return __makeToolsProxy(nextPath);",
    "  },",
    "  ownKeys() { throw __enumerationError(path); },",
    "  getOwnPropertyDescriptor() { throw __enumerationError(path); },",
    "  apply(_target, _thisArg, args) {",
    "    const toolPath = path.join('.');",
    "    if (!toolPath) throw new Error('Tool path missing in invocation');",
    "    return __callTool(toolPath, args[0]);",
    "  }",
    "});",
    "const tools = __makeToolsProxy();",
    "const console = {",
    "  log: (...args) => __log('log', args.map(__format).join(' ')),",
    "  warn: (...args) => __log('warn', args.map(__format).join(' ')),",
    "  error: (...args) => __log('error', args.map(__format).join(' ')),",
    "  info: (...args) => __log('info', args.map(__format).join(' ')),",
    "  debug: (...args) => __log('debug', args.map(__format).join(' '))",
    "};",
    "const fetch = () => { throw new Error('fetch is disabled in Codevisor code execution'); };",
    "(async () => {",
    body,
    "})()"
  ].join("\n")
}
