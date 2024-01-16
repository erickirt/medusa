import ts from "typescript"
import { DOCBLOCK_DOUBLE_LINES, DOCBLOCK_NEW_LINE } from "../constants.js"
import {
  camelToTitle,
  camelToWords,
  normalizeName,
} from "../utils/str-formatting.js"

type TemplateOptions = {
  parentName?: string
  rawParentName?: string
  returnTypeName?: string
}

type KnowledgeBase = {
  startsWith?: string
  endsWith?: string
  exact?: string
  template: string | ((str: string, options?: TemplateOptions) => string)
  kind?: ts.SyntaxKind[]
}

export type RetrieveOptions = {
  str: string
  templateOptions?: TemplateOptions
  kind?: ts.SyntaxKind
}

type RetrieveSymbolOptions = Omit<RetrieveOptions, "str"> & {
  symbol: ts.Symbol
}

/**
 * A class that holds common Medusa patterns and acts as a knowledge base for possible summaries/examples/general templates.
 */
class KnowledgeBaseFactory {
  private summaryKnowledgeBase: KnowledgeBase[] = [
    {
      startsWith: "FindConfig",
      template: (str) => {
        const typeArgs = str
          .replace("FindConfig<", "")
          .replace(/>$/, "")
          .split(",")
          .map((part) => camelToWords(normalizeName(part.trim())))
        const typeName =
          typeArgs.length > 0 && typeArgs[0].length > 0
            ? typeArgs[0]
            : `{type name}`
        return `The configurations determining how the ${typeName} is retrieved. Its properties, such as \`select\` or \`relations\`, accept the ${DOCBLOCK_NEW_LINE}attributes or relations associated with a ${typeName}.`
      },
    },
    {
      startsWith: "Filterable",
      endsWith: "Props",
      template: (str) => {
        return `The filters to apply on the retrieved ${camelToTitle(
          normalizeName(str)
        )}.`
      },
    },
    {
      startsWith: "Create",
      endsWith: "DTO",
      template: (str) => {
        return `The ${camelToTitle(normalizeName(str))} to be created.`
      },
    },
    {
      startsWith: "Update",
      endsWith: "DTO",
      template: (str) => {
        return `The attributes to update in the ${camelToTitle(
          normalizeName(str)
        )}.`
      },
    },
    {
      startsWith: "RestoreReturn",
      template: `Configurations determining which relations to restore along with each of the {type name}. You can pass to its \`returnLinkableKeys\` ${DOCBLOCK_NEW_LINE}property any of the {type name}'s relation attribute names, such as \`{type relation name}\`.`,
    },
    {
      endsWith: "DTO",
      template: (str: string): string => {
        return `The ${camelToTitle(normalizeName(str))} details.`
      },
    },
    {
      endsWith: "_id",
      template: (str: string): string => {
        const formatted = str.replace(/_id$/, "").split("_").join(" ")

        return `The associated ${formatted}'s ID.`
      },
      kind: [ts.SyntaxKind.PropertySignature],
    },
    {
      endsWith: "Id",
      template: (str: string): string => {
        const formatted = camelToWords(str.replace(/Id$/, ""))

        return `The ${formatted}'s ID.`
      },
      kind: [
        ts.SyntaxKind.PropertySignature,
        ts.SyntaxKind.PropertyDeclaration,
        ts.SyntaxKind.Parameter,
      ],
    },
    {
      exact: "id",
      template: (str, options) => {
        if (options?.rawParentName?.startsWith("Filterable")) {
          return `The IDs to filter ${options?.parentName || `{name}`} by.`
        }
        return `The ID of the ${options?.parentName || `{name}`}.`
      },
      kind: [ts.SyntaxKind.PropertySignature],
    },
    {
      exact: "metadata",
      template: "Holds custom data in key-value pairs.",
      kind: [ts.SyntaxKind.PropertySignature],
    },
    {
      exact: "customHeaders",
      template: "Custom headers to attach to the request.",
    },
  ]
  private functionSummaryKnowledgeBase: KnowledgeBase[] = [
    {
      startsWith: "listAndCount",
      template:
        "retrieves a paginated list of {return type} along with the total count of available {return type} satisfying the provided filters.",
    },
    {
      startsWith: "list",
      template:
        "retrieves a paginated list of {return type} based on optional filters and configuration.",
    },
    {
      startsWith: "retrieve",
      template: "retrieves a {return type} by its ID.",
    },
    {
      startsWith: "create",
      template: "creates a new {return type}",
    },
    {
      startsWith: "delete",
      template: "deletes {return type} by its ID.",
    },
    {
      startsWith: "update",
      template: "updates existing {return type}.",
    },
    {
      startsWith: "softDelete",
      template: "soft deletes {return type} by their IDs.",
    },
    {
      startsWith: "restore",
      template: "restores soft deleted {return type} by their IDs.",
    },
  ]
  private exampleCodeBlockLine = `${DOCBLOCK_DOUBLE_LINES}\`\`\`ts${DOCBLOCK_NEW_LINE}{example-code}${DOCBLOCK_NEW_LINE}\`\`\`${DOCBLOCK_DOUBLE_LINES}`
  private examplesKnowledgeBase: KnowledgeBase[] = [
    {
      startsWith: "list",
      template: `To retrieve a list of prices sets using their IDs: ${this.exampleCodeBlockLine}To specify relations that should be retrieved within the price sets: ${this.exampleCodeBlockLine}By default, only the first \`{default limit}\` records are retrieved. You can control pagination by specifying the \`skip\` and \`take\` properties of the \`config\` parameter: ${this.exampleCodeBlockLine}`,
    },
    {
      startsWith: "retrieve",
      template: `A simple example that retrieves a price set by its ID: ${this.exampleCodeBlockLine}To specify relations that should be retrieved: ${this.exampleCodeBlockLine}`,
    },
  ]
  private functionReturnKnowledgeBase: KnowledgeBase[] = [
    {
      startsWith: "listAndCount",
      template: "The list of {return type} along with their total count.",
    },
    {
      startsWith: "list",
      template: "The list of {return type}.",
    },
    {
      startsWith: "retrieve",
      template: "The retrieved {return type}.",
    },
    {
      startsWith: "create",
      template: "The created {return type}.",
    },
    {
      startsWith: "update",
      template: "The updated {return type}.",
    },
    {
      startsWith: "restore",
      template: `An object that includes the IDs of related records that were restored, such as the ID of associated {relation name}. ${DOCBLOCK_NEW_LINE}The object's keys are the ID attribute names of the {type name} entity's relations, such as \`{relation ID field name}\`, ${DOCBLOCK_NEW_LINE}and its value is an array of strings, each being the ID of the record associated with the money amount through this relation, ${DOCBLOCK_NEW_LINE}such as the IDs of associated {relation name}.`,
    },
  ]

  /**
   * Tries to find in a specified knowledge base a template relevant to the specified name.
   *
   * @param {string} str - A name that can be of a function, type, etc...
   * @param {KnowledgeBase[]} knowledgeBase - A knowledge base to search in.
   * @returns {string | undefined} The matching knowledge base template, if found.
   */
  tryToFindInKnowledgeBase({
    str,
    knowledgeBase,
    templateOptions,
    kind,
  }: RetrieveOptions & {
    knowledgeBase: KnowledgeBase[]
  }): string | undefined {
    const foundItem = knowledgeBase.find((item) => {
      if (item.exact) {
        return str === item.exact
      }

      if (item.kind?.length && (!kind || !item.kind.includes(kind))) {
        return false
      }

      if (item.startsWith && item.endsWith) {
        return str.startsWith(item.startsWith) && str.endsWith(item.endsWith)
      }

      if (item.startsWith) {
        return str.startsWith(item.startsWith)
      }

      return item.endsWith ? str.endsWith(item.endsWith) : false
    })

    if (!foundItem) {
      return
    }

    return typeof foundItem.template === "string"
      ? foundItem?.template
      : foundItem?.template(str, templateOptions)
  }

  /**
   * Tries to retrieve the summary template of a specified type from the {@link summaryKnowledgeBase}.
   *
   * @param {string} str - The name of the type to retrieve its summary.
   * @returns {string | undefined} The matching knowledge base template, if found.
   */
  tryToGetSummary({ str, ...options }: RetrieveOptions): string | undefined {
    const normalizedTypeStr = str.replaceAll("[]", "")
    return this.tryToFindInKnowledgeBase({
      ...options,
      str: normalizedTypeStr,
      knowledgeBase: this.summaryKnowledgeBase,
    })
  }

  /**
   * Tries to retrieve the summary template of a function's symbol from the {@link functionSummaryKnowledgeBase}.
   *
   * @param {ts.Symbol} symbol - The symbol of the function to retrieve its summary template.
   * @returns {string | undefined} The matching knowledge base template, if found.
   */
  tryToGetFunctionSummary({
    symbol,
    ...options
  }: RetrieveSymbolOptions): string | undefined {
    return this.tryToFindInKnowledgeBase({
      ...options,
      str: symbol.getName(),
      knowledgeBase: this.functionSummaryKnowledgeBase,
    })
  }

  /**
   * Tries to retrieve the example template of a function's symbol from the {@link examplesKnowledgeBase}.
   *
   * @param {ts.Symbol} symbol - The symbol of the function to retrieve its example template.
   * @returns {string | undefined} The matching knowledge base template, if found.
   */
  tryToGetFunctionExamples({
    symbol,
    ...options
  }: RetrieveSymbolOptions): string | undefined {
    return this.tryToFindInKnowledgeBase({
      ...options,
      str: symbol.getName(),
      knowledgeBase: this.examplesKnowledgeBase,
    })
  }

  /**
   * Tries to retrieve the return template of a function's symbol from the {@link functionReturnKnowledgeBase}.
   *
   * @param {ts.Symbol} symbol - The symbol of the function to retrieve its return template.
   * @returns {string | undefined} The matching knowledge base template, if found.
   */
  tryToGetFunctionReturns({
    symbol,
    ...options
  }: RetrieveSymbolOptions): string | undefined {
    return this.tryToFindInKnowledgeBase({
      ...options,
      str: symbol.getName(),
      knowledgeBase: this.functionReturnKnowledgeBase,
    })
  }
}

export default KnowledgeBaseFactory
