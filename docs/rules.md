# Rules reference

Generated from `packages/core/src/rules/registry.ts` and `packages/core/src/verify/rules.ts`. Do not edit by hand.

## Change rules

357 rules reported by `diff`. Severity is the default and can be overridden in config.

| ID                                                      | Severity | Source  | Description                                                                                                  |
| ------------------------------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `api-server-added`                                      | info     | openapi | A server URL was added.                                                                                      |
| `api-server-removed`                                    | warning  | openapi | A server URL was removed.                                                                                    |
| `api-title-changed`                                     | info     | openapi | The API title changed.                                                                                       |
| `api-version-changed`                                   | info     | openapi | The API version string changed.                                                                              |
| `deprecated-endpoint-removed`                           | warning  | openapi | A previously deprecated operation was removed.                                                               |
| `endpoint-added`                                        | info     | openapi | An operation was added.                                                                                      |
| `endpoint-deprecated`                                   | warning  | openapi | An operation was marked deprecated.                                                                          |
| `endpoint-description-changed`                          | info     | openapi | An operation's description changed.                                                                          |
| `endpoint-operation-id-added`                           | info     | openapi | An operation gained an operationId.                                                                          |
| `endpoint-operation-id-changed`                         | warning  | openapi | An operationId changed; generated clients will change.                                                       |
| `endpoint-operation-id-removed`                         | warning  | openapi | An operation lost its operationId; generated clients will change.                                            |
| `endpoint-removed`                                      | breaking | openapi | An operation was removed without having been deprecated.                                                     |
| `endpoint-summary-changed`                              | info     | openapi | An operation's summary changed.                                                                              |
| `endpoint-undeprecated`                                 | info     | openapi | An operation is no longer deprecated.                                                                        |
| `prompt-added`                                          | info     | mcp     | A prompt was added.                                                                                          |
| `prompt-argument-added`                                 | info     | mcp     | An optional prompt argument was added.                                                                       |
| `prompt-argument-became-optional`                       | info     | mcp     | A prompt argument became optional.                                                                           |
| `prompt-argument-became-required`                       | breaking | mcp     | A prompt argument became required.                                                                           |
| `prompt-argument-description-changed`                   | info     | mcp     | A prompt argument's description changed.                                                                     |
| `prompt-argument-removed`                               | warning  | mcp     | A prompt argument was removed.                                                                               |
| `prompt-description-changed`                            | info     | mcp     | A prompt's description changed.                                                                              |
| `prompt-removed`                                        | breaking | mcp     | A prompt was removed.                                                                                        |
| `prompt-required-argument-added`                        | breaking | mcp     | A required prompt argument was added.                                                                        |
| `request-body-added`                                    | info     | openapi | An optional request body was added.                                                                          |
| `request-body-became-optional`                          | info     | openapi | The request body became optional.                                                                            |
| `request-body-became-required`                          | breaking | openapi | The request body became required.                                                                            |
| `request-body-media-type-added`                         | info     | openapi | The request body accepts a new media type.                                                                   |
| `request-body-media-type-removed`                       | breaking | openapi | The request body no longer accepts a media type.                                                             |
| `request-body-removed`                                  | warning  | openapi | The request body was removed.                                                                                |
| `request-parameter-added`                               | info     | openapi | An optional parameter was added.                                                                             |
| `request-parameter-additional-properties-allowed`       | info     | openapi | Unknown properties are now allowed. (input schema under request-parameter)                                   |
| `request-parameter-additional-properties-disallowed`    | breaking | openapi | Unknown properties are now rejected. (input schema under request-parameter)                                  |
| `request-parameter-all-of-branch-added`                 | breaking | openapi | A constraint was added to an allOf. (input schema under request-parameter)                                   |
| `request-parameter-all-of-branch-removed`               | info     | openapi | A constraint was removed from an allOf. (input schema under request-parameter)                               |
| `request-parameter-became-optional`                     | info     | openapi | A required parameter became optional.                                                                        |
| `request-parameter-became-required`                     | breaking | openapi | An optional parameter became required.                                                                       |
| `request-parameter-const-changed`                       | breaking | openapi | A constant value changed. (input schema under request-parameter)                                             |
| `request-parameter-default-added`                       | info     | openapi | A default value was added. (input schema under request-parameter)                                            |
| `request-parameter-default-changed`                     | warning  | openapi | A default value changed. (input schema under request-parameter)                                              |
| `request-parameter-default-removed`                     | warning  | openapi | A default value was removed. (input schema under request-parameter)                                          |
| `request-parameter-deprecated`                          | warning  | openapi | The value was marked deprecated. (input schema under request-parameter)                                      |
| `request-parameter-description-changed`                 | info     | openapi | The description changed. (input schema under request-parameter)                                              |
| `request-parameter-enum-added`                          | breaking | openapi | The value is now restricted to an enum. (input schema under request-parameter)                               |
| `request-parameter-enum-removed`                        | info     | openapi | The value is no longer restricted to an enum. (input schema under request-parameter)                         |
| `request-parameter-enum-value-added`                    | info     | openapi | A value was added to an enum. (input schema under request-parameter)                                         |
| `request-parameter-enum-value-removed`                  | breaking | openapi | A value was removed from an enum. (input schema under request-parameter)                                     |
| `request-parameter-format-changed`                      | warning  | openapi | The format annotation changed. (input schema under request-parameter)                                        |
| `request-parameter-items-added`                         | breaking | openapi | Array items are now constrained by a schema. (input schema under request-parameter)                          |
| `request-parameter-items-removed`                       | info     | openapi | Array items are no longer constrained by a schema. (input schema under request-parameter)                    |
| `request-parameter-max-added`                           | breaking | openapi | A maximum constraint was added. (input schema under request-parameter)                                       |
| `request-parameter-max-decreased`                       | breaking | openapi | A maximum constraint decreased. (input schema under request-parameter)                                       |
| `request-parameter-max-increased`                       | info     | openapi | A maximum constraint increased. (input schema under request-parameter)                                       |
| `request-parameter-max-removed`                         | info     | openapi | A maximum constraint was removed. (input schema under request-parameter)                                     |
| `request-parameter-min-added`                           | breaking | openapi | A minimum constraint was added. (input schema under request-parameter)                                       |
| `request-parameter-min-decreased`                       | info     | openapi | A minimum constraint decreased. (input schema under request-parameter)                                       |
| `request-parameter-min-increased`                       | breaking | openapi | A minimum constraint increased. (input schema under request-parameter)                                       |
| `request-parameter-min-removed`                         | info     | openapi | A minimum constraint was removed. (input schema under request-parameter)                                     |
| `request-parameter-multiple-of-changed`                 | warning  | openapi | The multipleOf constraint changed. (input schema under request-parameter)                                    |
| `request-parameter-nullable-added`                      | info     | openapi | The value may now be null. (input schema under request-parameter)                                            |
| `request-parameter-nullable-removed`                    | breaking | openapi | The value may no longer be null. (input schema under request-parameter)                                      |
| `request-parameter-one-of-branch-added`                 | info     | openapi | An alternative was added to a oneOf or anyOf. (input schema under request-parameter)                         |
| `request-parameter-one-of-branch-removed`               | breaking | openapi | An alternative was removed from a oneOf or anyOf. (input schema under request-parameter)                     |
| `request-parameter-pattern-added`                       | breaking | openapi | A pattern constraint was added. (input schema under request-parameter)                                       |
| `request-parameter-pattern-changed`                     | warning  | openapi | A pattern constraint changed. (input schema under request-parameter)                                         |
| `request-parameter-pattern-removed`                     | info     | openapi | A pattern constraint was removed. (input schema under request-parameter)                                     |
| `request-parameter-property-added`                      | info     | openapi | An optional property was added, or a required one with a default. (input schema under request-parameter)     |
| `request-parameter-property-became-optional`            | info     | openapi | A required property became optional. (input schema under request-parameter)                                  |
| `request-parameter-property-became-required`            | breaking | openapi | An existing property became required. (input schema under request-parameter)                                 |
| `request-parameter-property-removed`                    | warning  | openapi | A property was removed. (input schema under request-parameter)                                               |
| `request-parameter-recursion-changed`                   | warning  | openapi | A schema became recursive or stopped being recursive. (input schema under request-parameter)                 |
| `request-parameter-removed`                             | warning  | openapi | A parameter was removed; clients still sending it may be rejected.                                           |
| `request-parameter-required-property-added`             | breaking | openapi | A required property without a default was added. (input schema under request-parameter)                      |
| `request-parameter-schema-added`                        | breaking | openapi | A schema now constrains a value that previously had none. (input schema under request-parameter)             |
| `request-parameter-schema-removed`                      | info     | openapi | A value that had a schema no longer has one; anything may appear. (input schema under request-parameter)     |
| `request-parameter-type-changed`                        | breaking | openapi | The type changed to something incompatible. (input schema under request-parameter)                           |
| `request-parameter-type-narrowed`                       | breaking | openapi | The set of allowed types shrank. (input schema under request-parameter)                                      |
| `request-parameter-type-widened`                        | info     | openapi | The set of allowed types grew. (input schema under request-parameter)                                        |
| `request-parameter-undeprecated`                        | info     | openapi | The value is no longer marked deprecated. (input schema under request-parameter)                             |
| `request-parameter-unique-items-added`                  | breaking | openapi | Array items must now be unique. (input schema under request-parameter)                                       |
| `request-parameter-unique-items-removed`                | info     | openapi | Array items no longer need to be unique. (input schema under request-parameter)                              |
| `request-property-additional-properties-allowed`        | info     | openapi | Unknown properties are now allowed. (input schema under request-property)                                    |
| `request-property-additional-properties-disallowed`     | breaking | openapi | Unknown properties are now rejected. (input schema under request-property)                                   |
| `request-property-all-of-branch-added`                  | breaking | openapi | A constraint was added to an allOf. (input schema under request-property)                                    |
| `request-property-all-of-branch-removed`                | info     | openapi | A constraint was removed from an allOf. (input schema under request-property)                                |
| `request-property-const-changed`                        | breaking | openapi | A constant value changed. (input schema under request-property)                                              |
| `request-property-default-added`                        | info     | openapi | A default value was added. (input schema under request-property)                                             |
| `request-property-default-changed`                      | warning  | openapi | A default value changed. (input schema under request-property)                                               |
| `request-property-default-removed`                      | warning  | openapi | A default value was removed. (input schema under request-property)                                           |
| `request-property-deprecated`                           | warning  | openapi | The value was marked deprecated. (input schema under request-property)                                       |
| `request-property-description-changed`                  | info     | openapi | The description changed. (input schema under request-property)                                               |
| `request-property-enum-added`                           | breaking | openapi | The value is now restricted to an enum. (input schema under request-property)                                |
| `request-property-enum-removed`                         | info     | openapi | The value is no longer restricted to an enum. (input schema under request-property)                          |
| `request-property-enum-value-added`                     | info     | openapi | A value was added to an enum. (input schema under request-property)                                          |
| `request-property-enum-value-removed`                   | breaking | openapi | A value was removed from an enum. (input schema under request-property)                                      |
| `request-property-format-changed`                       | warning  | openapi | The format annotation changed. (input schema under request-property)                                         |
| `request-property-items-added`                          | breaking | openapi | Array items are now constrained by a schema. (input schema under request-property)                           |
| `request-property-items-removed`                        | info     | openapi | Array items are no longer constrained by a schema. (input schema under request-property)                     |
| `request-property-max-added`                            | breaking | openapi | A maximum constraint was added. (input schema under request-property)                                        |
| `request-property-max-decreased`                        | breaking | openapi | A maximum constraint decreased. (input schema under request-property)                                        |
| `request-property-max-increased`                        | info     | openapi | A maximum constraint increased. (input schema under request-property)                                        |
| `request-property-max-removed`                          | info     | openapi | A maximum constraint was removed. (input schema under request-property)                                      |
| `request-property-min-added`                            | breaking | openapi | A minimum constraint was added. (input schema under request-property)                                        |
| `request-property-min-decreased`                        | info     | openapi | A minimum constraint decreased. (input schema under request-property)                                        |
| `request-property-min-increased`                        | breaking | openapi | A minimum constraint increased. (input schema under request-property)                                        |
| `request-property-min-removed`                          | info     | openapi | A minimum constraint was removed. (input schema under request-property)                                      |
| `request-property-multiple-of-changed`                  | warning  | openapi | The multipleOf constraint changed. (input schema under request-property)                                     |
| `request-property-nullable-added`                       | info     | openapi | The value may now be null. (input schema under request-property)                                             |
| `request-property-nullable-removed`                     | breaking | openapi | The value may no longer be null. (input schema under request-property)                                       |
| `request-property-one-of-branch-added`                  | info     | openapi | An alternative was added to a oneOf or anyOf. (input schema under request-property)                          |
| `request-property-one-of-branch-removed`                | breaking | openapi | An alternative was removed from a oneOf or anyOf. (input schema under request-property)                      |
| `request-property-pattern-added`                        | breaking | openapi | A pattern constraint was added. (input schema under request-property)                                        |
| `request-property-pattern-changed`                      | warning  | openapi | A pattern constraint changed. (input schema under request-property)                                          |
| `request-property-pattern-removed`                      | info     | openapi | A pattern constraint was removed. (input schema under request-property)                                      |
| `request-property-property-added`                       | info     | openapi | An optional property was added, or a required one with a default. (input schema under request-property)      |
| `request-property-property-became-optional`             | info     | openapi | A required property became optional. (input schema under request-property)                                   |
| `request-property-property-became-required`             | breaking | openapi | An existing property became required. (input schema under request-property)                                  |
| `request-property-property-removed`                     | warning  | openapi | A property was removed. (input schema under request-property)                                                |
| `request-property-recursion-changed`                    | warning  | openapi | A schema became recursive or stopped being recursive. (input schema under request-property)                  |
| `request-property-required-property-added`              | breaking | openapi | A required property without a default was added. (input schema under request-property)                       |
| `request-property-schema-added`                         | breaking | openapi | A schema now constrains a value that previously had none. (input schema under request-property)              |
| `request-property-schema-removed`                       | info     | openapi | A value that had a schema no longer has one; anything may appear. (input schema under request-property)      |
| `request-property-type-changed`                         | breaking | openapi | The type changed to something incompatible. (input schema under request-property)                            |
| `request-property-type-narrowed`                        | breaking | openapi | The set of allowed types shrank. (input schema under request-property)                                       |
| `request-property-type-widened`                         | info     | openapi | The set of allowed types grew. (input schema under request-property)                                         |
| `request-property-undeprecated`                         | info     | openapi | The value is no longer marked deprecated. (input schema under request-property)                              |
| `request-property-unique-items-added`                   | breaking | openapi | Array items must now be unique. (input schema under request-property)                                        |
| `request-property-unique-items-removed`                 | info     | openapi | Array items no longer need to be unique. (input schema under request-property)                               |
| `request-required-body-added`                           | breaking | openapi | A required request body was added.                                                                           |
| `request-required-parameter-added`                      | breaking | openapi | A required parameter was added.                                                                              |
| `resource-added`                                        | info     | mcp     | A resource was added.                                                                                        |
| `resource-description-changed`                          | info     | mcp     | A resource's description changed.                                                                            |
| `resource-mime-type-changed`                            | warning  | mcp     | A resource's MIME type changed.                                                                              |
| `resource-name-changed`                                 | info     | mcp     | A resource's name changed.                                                                                   |
| `resource-removed`                                      | breaking | mcp     | A resource was removed.                                                                                      |
| `resource-template-added`                               | info     | mcp     | A resource template was added.                                                                               |
| `resource-template-changed`                             | warning  | mcp     | A resource template's name, description or MIME type changed.                                                |
| `resource-template-removed`                             | breaking | mcp     | A resource template was removed.                                                                             |
| `response-added`                                        | info     | openapi | A response status was added.                                                                                 |
| `response-description-changed`                          | info     | openapi | A response description changed.                                                                              |
| `response-header-added`                                 | info     | openapi | A response header was added.                                                                                 |
| `response-header-additional-properties-allowed`         | warning  | openapi | Unknown properties are now allowed. (output schema under response-header)                                    |
| `response-header-additional-properties-disallowed`      | info     | openapi | Unknown properties are now rejected. (output schema under response-header)                                   |
| `response-header-all-of-branch-added`                   | info     | openapi | A constraint was added to an allOf. (output schema under response-header)                                    |
| `response-header-all-of-branch-removed`                 | warning  | openapi | A constraint was removed from an allOf. (output schema under response-header)                                |
| `response-header-became-optional`                       | breaking | openapi | A required response header became optional.                                                                  |
| `response-header-became-required`                       | info     | openapi | An optional response header became required.                                                                 |
| `response-header-const-changed`                         | breaking | openapi | A constant value changed. (output schema under response-header)                                              |
| `response-header-default-added`                         | info     | openapi | A default value was added. (output schema under response-header)                                             |
| `response-header-default-changed`                       | warning  | openapi | A default value changed. (output schema under response-header)                                               |
| `response-header-default-removed`                       | info     | openapi | A default value was removed. (output schema under response-header)                                           |
| `response-header-deprecated`                            | warning  | openapi | The value was marked deprecated. (output schema under response-header)                                       |
| `response-header-description-changed`                   | info     | openapi | The description changed. (output schema under response-header)                                               |
| `response-header-enum-added`                            | info     | openapi | The value is now restricted to an enum. (output schema under response-header)                                |
| `response-header-enum-removed`                          | warning  | openapi | The value is no longer restricted to an enum. (output schema under response-header)                          |
| `response-header-enum-value-added`                      | warning  | openapi | A value was added to an enum. (output schema under response-header)                                          |
| `response-header-enum-value-removed`                    | info     | openapi | A value was removed from an enum. (output schema under response-header)                                      |
| `response-header-format-changed`                        | warning  | openapi | The format annotation changed. (output schema under response-header)                                         |
| `response-header-items-added`                           | info     | openapi | Array items are now constrained by a schema. (output schema under response-header)                           |
| `response-header-items-removed`                         | warning  | openapi | Array items are no longer constrained by a schema. (output schema under response-header)                     |
| `response-header-max-added`                             | info     | openapi | A maximum constraint was added. (output schema under response-header)                                        |
| `response-header-max-decreased`                         | info     | openapi | A maximum constraint decreased. (output schema under response-header)                                        |
| `response-header-max-increased`                         | warning  | openapi | A maximum constraint increased. (output schema under response-header)                                        |
| `response-header-max-removed`                           | warning  | openapi | A maximum constraint was removed. (output schema under response-header)                                      |
| `response-header-min-added`                             | info     | openapi | A minimum constraint was added. (output schema under response-header)                                        |
| `response-header-min-decreased`                         | warning  | openapi | A minimum constraint decreased. (output schema under response-header)                                        |
| `response-header-min-increased`                         | info     | openapi | A minimum constraint increased. (output schema under response-header)                                        |
| `response-header-min-removed`                           | warning  | openapi | A minimum constraint was removed. (output schema under response-header)                                      |
| `response-header-multiple-of-changed`                   | warning  | openapi | The multipleOf constraint changed. (output schema under response-header)                                     |
| `response-header-nullable-added`                        | breaking | openapi | The value may now be null. (output schema under response-header)                                             |
| `response-header-nullable-removed`                      | info     | openapi | The value may no longer be null. (output schema under response-header)                                       |
| `response-header-one-of-branch-added`                   | warning  | openapi | An alternative was added to a oneOf or anyOf. (output schema under response-header)                          |
| `response-header-one-of-branch-removed`                 | info     | openapi | An alternative was removed from a oneOf or anyOf. (output schema under response-header)                      |
| `response-header-pattern-added`                         | info     | openapi | A pattern constraint was added. (output schema under response-header)                                        |
| `response-header-pattern-changed`                       | warning  | openapi | A pattern constraint changed. (output schema under response-header)                                          |
| `response-header-pattern-removed`                       | warning  | openapi | A pattern constraint was removed. (output schema under response-header)                                      |
| `response-header-property-added`                        | info     | openapi | An optional property was added, or a required one with a default. (output schema under response-header)      |
| `response-header-property-became-optional`              | breaking | openapi | A required property became optional. (output schema under response-header)                                   |
| `response-header-property-became-required`              | info     | openapi | An existing property became required. (output schema under response-header)                                  |
| `response-header-property-removed`                      | breaking | openapi | A property was removed. (output schema under response-header)                                                |
| `response-header-recursion-changed`                     | warning  | openapi | A schema became recursive or stopped being recursive. (output schema under response-header)                  |
| `response-header-removed`                               | breaking | openapi | A response header was removed.                                                                               |
| `response-header-required-property-added`               | info     | openapi | A required property without a default was added. (output schema under response-header)                       |
| `response-header-schema-added`                          | info     | openapi | A schema now constrains a value that previously had none. (output schema under response-header)              |
| `response-header-schema-removed`                        | warning  | openapi | A value that had a schema no longer has one; anything may appear. (output schema under response-header)      |
| `response-header-type-changed`                          | breaking | openapi | The type changed to something incompatible. (output schema under response-header)                            |
| `response-header-type-narrowed`                         | info     | openapi | The set of allowed types shrank. (output schema under response-header)                                       |
| `response-header-type-widened`                          | breaking | openapi | The set of allowed types grew. (output schema under response-header)                                         |
| `response-header-undeprecated`                          | info     | openapi | The value is no longer marked deprecated. (output schema under response-header)                              |
| `response-header-unique-items-added`                    | info     | openapi | Array items must now be unique. (output schema under response-header)                                        |
| `response-header-unique-items-removed`                  | warning  | openapi | Array items no longer need to be unique. (output schema under response-header)                               |
| `response-media-type-added`                             | info     | openapi | A response may now be returned in a new media type.                                                          |
| `response-media-type-removed`                           | breaking | openapi | A response media type was removed.                                                                           |
| `response-property-additional-properties-allowed`       | warning  | openapi | Unknown properties are now allowed. (output schema under response-property)                                  |
| `response-property-additional-properties-disallowed`    | info     | openapi | Unknown properties are now rejected. (output schema under response-property)                                 |
| `response-property-all-of-branch-added`                 | info     | openapi | A constraint was added to an allOf. (output schema under response-property)                                  |
| `response-property-all-of-branch-removed`               | warning  | openapi | A constraint was removed from an allOf. (output schema under response-property)                              |
| `response-property-const-changed`                       | breaking | openapi | A constant value changed. (output schema under response-property)                                            |
| `response-property-default-added`                       | info     | openapi | A default value was added. (output schema under response-property)                                           |
| `response-property-default-changed`                     | warning  | openapi | A default value changed. (output schema under response-property)                                             |
| `response-property-default-removed`                     | info     | openapi | A default value was removed. (output schema under response-property)                                         |
| `response-property-deprecated`                          | warning  | openapi | The value was marked deprecated. (output schema under response-property)                                     |
| `response-property-description-changed`                 | info     | openapi | The description changed. (output schema under response-property)                                             |
| `response-property-enum-added`                          | info     | openapi | The value is now restricted to an enum. (output schema under response-property)                              |
| `response-property-enum-removed`                        | warning  | openapi | The value is no longer restricted to an enum. (output schema under response-property)                        |
| `response-property-enum-value-added`                    | warning  | openapi | A value was added to an enum. (output schema under response-property)                                        |
| `response-property-enum-value-removed`                  | info     | openapi | A value was removed from an enum. (output schema under response-property)                                    |
| `response-property-format-changed`                      | warning  | openapi | The format annotation changed. (output schema under response-property)                                       |
| `response-property-items-added`                         | info     | openapi | Array items are now constrained by a schema. (output schema under response-property)                         |
| `response-property-items-removed`                       | warning  | openapi | Array items are no longer constrained by a schema. (output schema under response-property)                   |
| `response-property-max-added`                           | info     | openapi | A maximum constraint was added. (output schema under response-property)                                      |
| `response-property-max-decreased`                       | info     | openapi | A maximum constraint decreased. (output schema under response-property)                                      |
| `response-property-max-increased`                       | warning  | openapi | A maximum constraint increased. (output schema under response-property)                                      |
| `response-property-max-removed`                         | warning  | openapi | A maximum constraint was removed. (output schema under response-property)                                    |
| `response-property-min-added`                           | info     | openapi | A minimum constraint was added. (output schema under response-property)                                      |
| `response-property-min-decreased`                       | warning  | openapi | A minimum constraint decreased. (output schema under response-property)                                      |
| `response-property-min-increased`                       | info     | openapi | A minimum constraint increased. (output schema under response-property)                                      |
| `response-property-min-removed`                         | warning  | openapi | A minimum constraint was removed. (output schema under response-property)                                    |
| `response-property-multiple-of-changed`                 | warning  | openapi | The multipleOf constraint changed. (output schema under response-property)                                   |
| `response-property-nullable-added`                      | breaking | openapi | The value may now be null. (output schema under response-property)                                           |
| `response-property-nullable-removed`                    | info     | openapi | The value may no longer be null. (output schema under response-property)                                     |
| `response-property-one-of-branch-added`                 | warning  | openapi | An alternative was added to a oneOf or anyOf. (output schema under response-property)                        |
| `response-property-one-of-branch-removed`               | info     | openapi | An alternative was removed from a oneOf or anyOf. (output schema under response-property)                    |
| `response-property-pattern-added`                       | info     | openapi | A pattern constraint was added. (output schema under response-property)                                      |
| `response-property-pattern-changed`                     | warning  | openapi | A pattern constraint changed. (output schema under response-property)                                        |
| `response-property-pattern-removed`                     | warning  | openapi | A pattern constraint was removed. (output schema under response-property)                                    |
| `response-property-property-added`                      | info     | openapi | An optional property was added, or a required one with a default. (output schema under response-property)    |
| `response-property-property-became-optional`            | breaking | openapi | A required property became optional. (output schema under response-property)                                 |
| `response-property-property-became-required`            | info     | openapi | An existing property became required. (output schema under response-property)                                |
| `response-property-property-removed`                    | breaking | openapi | A property was removed. (output schema under response-property)                                              |
| `response-property-recursion-changed`                   | warning  | openapi | A schema became recursive or stopped being recursive. (output schema under response-property)                |
| `response-property-required-property-added`             | info     | openapi | A required property without a default was added. (output schema under response-property)                     |
| `response-property-schema-added`                        | info     | openapi | A schema now constrains a value that previously had none. (output schema under response-property)            |
| `response-property-schema-removed`                      | warning  | openapi | A value that had a schema no longer has one; anything may appear. (output schema under response-property)    |
| `response-property-type-changed`                        | breaking | openapi | The type changed to something incompatible. (output schema under response-property)                          |
| `response-property-type-narrowed`                       | info     | openapi | The set of allowed types shrank. (output schema under response-property)                                     |
| `response-property-type-widened`                        | breaking | openapi | The set of allowed types grew. (output schema under response-property)                                       |
| `response-property-undeprecated`                        | info     | openapi | The value is no longer marked deprecated. (output schema under response-property)                            |
| `response-property-unique-items-added`                  | info     | openapi | Array items must now be unique. (output schema under response-property)                                      |
| `response-property-unique-items-removed`                | warning  | openapi | Array items no longer need to be unique. (output schema under response-property)                             |
| `response-removed`                                      | breaking | openapi | A response status was removed.                                                                               |
| `security-added`                                        | breaking | openapi | Authentication is now required where none was before.                                                        |
| `security-removed`                                      | info     | openapi | Authentication is no longer required.                                                                        |
| `security-requirement-added`                            | info     | openapi | A new way to authenticate was added.                                                                         |
| `security-requirement-removed`                          | breaking | openapi | A way to authenticate was removed.                                                                           |
| `security-scheme-added`                                 | info     | openapi | A security scheme was defined.                                                                               |
| `security-scheme-changed`                               | breaking | openapi | A security scheme's type, location or flow changed.                                                          |
| `security-scheme-removed`                               | breaking | openapi | A security scheme was removed.                                                                               |
| `security-scope-added`                                  | breaking | openapi | An additional scope is now required.                                                                         |
| `security-scope-removed`                                | info     | openapi | A scope is no longer required.                                                                               |
| `server-capability-added`                               | info     | mcp     | The server advertises a new capability.                                                                      |
| `server-capability-removed`                             | breaking | mcp     | The server no longer advertises a capability.                                                                |
| `server-instructions-changed`                           | warning  | mcp     | The server instructions changed; this alters agent behavior.                                                 |
| `server-instructions-injection-suspected`               | warning  | mcp     | The server instructions contain language that looks aimed at overriding an agent.                            |
| `server-name-changed`                                   | info     | mcp     | The server name changed.                                                                                     |
| `server-version-changed`                                | info     | mcp     | The server version changed.                                                                                  |
| `tool-added`                                            | info     | mcp     | A tool was added.                                                                                            |
| `tool-annotation-changed`                               | warning  | mcp     | A tool's behavior annotations changed (for example destructiveHint).                                         |
| `tool-description-changed`                              | warning  | mcp     | A tool's description changed; agents choose and use tools by description.                                    |
| `tool-description-injection-suspected`                  | warning  | mcp     | A tool description contains language that looks aimed at overriding an agent.                                |
| `tool-input-property-additional-properties-allowed`     | info     | mcp     | Unknown properties are now allowed. (input schema under tool-input-property)                                 |
| `tool-input-property-additional-properties-disallowed`  | breaking | mcp     | Unknown properties are now rejected. (input schema under tool-input-property)                                |
| `tool-input-property-all-of-branch-added`               | breaking | mcp     | A constraint was added to an allOf. (input schema under tool-input-property)                                 |
| `tool-input-property-all-of-branch-removed`             | info     | mcp     | A constraint was removed from an allOf. (input schema under tool-input-property)                             |
| `tool-input-property-const-changed`                     | breaking | mcp     | A constant value changed. (input schema under tool-input-property)                                           |
| `tool-input-property-default-added`                     | info     | mcp     | A default value was added. (input schema under tool-input-property)                                          |
| `tool-input-property-default-changed`                   | warning  | mcp     | A default value changed. (input schema under tool-input-property)                                            |
| `tool-input-property-default-removed`                   | warning  | mcp     | A default value was removed. (input schema under tool-input-property)                                        |
| `tool-input-property-deprecated`                        | warning  | mcp     | The value was marked deprecated. (input schema under tool-input-property)                                    |
| `tool-input-property-description-changed`               | info     | mcp     | The description changed. (input schema under tool-input-property)                                            |
| `tool-input-property-enum-added`                        | breaking | mcp     | The value is now restricted to an enum. (input schema under tool-input-property)                             |
| `tool-input-property-enum-removed`                      | info     | mcp     | The value is no longer restricted to an enum. (input schema under tool-input-property)                       |
| `tool-input-property-enum-value-added`                  | info     | mcp     | A value was added to an enum. (input schema under tool-input-property)                                       |
| `tool-input-property-enum-value-removed`                | breaking | mcp     | A value was removed from an enum. (input schema under tool-input-property)                                   |
| `tool-input-property-format-changed`                    | warning  | mcp     | The format annotation changed. (input schema under tool-input-property)                                      |
| `tool-input-property-items-added`                       | breaking | mcp     | Array items are now constrained by a schema. (input schema under tool-input-property)                        |
| `tool-input-property-items-removed`                     | info     | mcp     | Array items are no longer constrained by a schema. (input schema under tool-input-property)                  |
| `tool-input-property-max-added`                         | breaking | mcp     | A maximum constraint was added. (input schema under tool-input-property)                                     |
| `tool-input-property-max-decreased`                     | breaking | mcp     | A maximum constraint decreased. (input schema under tool-input-property)                                     |
| `tool-input-property-max-increased`                     | info     | mcp     | A maximum constraint increased. (input schema under tool-input-property)                                     |
| `tool-input-property-max-removed`                       | info     | mcp     | A maximum constraint was removed. (input schema under tool-input-property)                                   |
| `tool-input-property-min-added`                         | breaking | mcp     | A minimum constraint was added. (input schema under tool-input-property)                                     |
| `tool-input-property-min-decreased`                     | info     | mcp     | A minimum constraint decreased. (input schema under tool-input-property)                                     |
| `tool-input-property-min-increased`                     | breaking | mcp     | A minimum constraint increased. (input schema under tool-input-property)                                     |
| `tool-input-property-min-removed`                       | info     | mcp     | A minimum constraint was removed. (input schema under tool-input-property)                                   |
| `tool-input-property-multiple-of-changed`               | warning  | mcp     | The multipleOf constraint changed. (input schema under tool-input-property)                                  |
| `tool-input-property-nullable-added`                    | info     | mcp     | The value may now be null. (input schema under tool-input-property)                                          |
| `tool-input-property-nullable-removed`                  | breaking | mcp     | The value may no longer be null. (input schema under tool-input-property)                                    |
| `tool-input-property-one-of-branch-added`               | info     | mcp     | An alternative was added to a oneOf or anyOf. (input schema under tool-input-property)                       |
| `tool-input-property-one-of-branch-removed`             | breaking | mcp     | An alternative was removed from a oneOf or anyOf. (input schema under tool-input-property)                   |
| `tool-input-property-pattern-added`                     | breaking | mcp     | A pattern constraint was added. (input schema under tool-input-property)                                     |
| `tool-input-property-pattern-changed`                   | warning  | mcp     | A pattern constraint changed. (input schema under tool-input-property)                                       |
| `tool-input-property-pattern-removed`                   | info     | mcp     | A pattern constraint was removed. (input schema under tool-input-property)                                   |
| `tool-input-property-property-added`                    | info     | mcp     | An optional property was added, or a required one with a default. (input schema under tool-input-property)   |
| `tool-input-property-property-became-optional`          | info     | mcp     | A required property became optional. (input schema under tool-input-property)                                |
| `tool-input-property-property-became-required`          | breaking | mcp     | An existing property became required. (input schema under tool-input-property)                               |
| `tool-input-property-property-removed`                  | warning  | mcp     | A property was removed. (input schema under tool-input-property)                                             |
| `tool-input-property-recursion-changed`                 | warning  | mcp     | A schema became recursive or stopped being recursive. (input schema under tool-input-property)               |
| `tool-input-property-required-property-added`           | breaking | mcp     | A required property without a default was added. (input schema under tool-input-property)                    |
| `tool-input-property-schema-added`                      | breaking | mcp     | A schema now constrains a value that previously had none. (input schema under tool-input-property)           |
| `tool-input-property-schema-removed`                    | info     | mcp     | A value that had a schema no longer has one; anything may appear. (input schema under tool-input-property)   |
| `tool-input-property-type-changed`                      | breaking | mcp     | The type changed to something incompatible. (input schema under tool-input-property)                         |
| `tool-input-property-type-narrowed`                     | breaking | mcp     | The set of allowed types shrank. (input schema under tool-input-property)                                    |
| `tool-input-property-type-widened`                      | info     | mcp     | The set of allowed types grew. (input schema under tool-input-property)                                      |
| `tool-input-property-undeprecated`                      | info     | mcp     | The value is no longer marked deprecated. (input schema under tool-input-property)                           |
| `tool-input-property-unique-items-added`                | breaking | mcp     | Array items must now be unique. (input schema under tool-input-property)                                     |
| `tool-input-property-unique-items-removed`              | info     | mcp     | Array items no longer need to be unique. (input schema under tool-input-property)                            |
| `tool-output-property-additional-properties-allowed`    | warning  | mcp     | Unknown properties are now allowed. (output schema under tool-output-property)                               |
| `tool-output-property-additional-properties-disallowed` | info     | mcp     | Unknown properties are now rejected. (output schema under tool-output-property)                              |
| `tool-output-property-all-of-branch-added`              | info     | mcp     | A constraint was added to an allOf. (output schema under tool-output-property)                               |
| `tool-output-property-all-of-branch-removed`            | warning  | mcp     | A constraint was removed from an allOf. (output schema under tool-output-property)                           |
| `tool-output-property-const-changed`                    | breaking | mcp     | A constant value changed. (output schema under tool-output-property)                                         |
| `tool-output-property-default-added`                    | info     | mcp     | A default value was added. (output schema under tool-output-property)                                        |
| `tool-output-property-default-changed`                  | warning  | mcp     | A default value changed. (output schema under tool-output-property)                                          |
| `tool-output-property-default-removed`                  | info     | mcp     | A default value was removed. (output schema under tool-output-property)                                      |
| `tool-output-property-deprecated`                       | warning  | mcp     | The value was marked deprecated. (output schema under tool-output-property)                                  |
| `tool-output-property-description-changed`              | info     | mcp     | The description changed. (output schema under tool-output-property)                                          |
| `tool-output-property-enum-added`                       | info     | mcp     | The value is now restricted to an enum. (output schema under tool-output-property)                           |
| `tool-output-property-enum-removed`                     | warning  | mcp     | The value is no longer restricted to an enum. (output schema under tool-output-property)                     |
| `tool-output-property-enum-value-added`                 | warning  | mcp     | A value was added to an enum. (output schema under tool-output-property)                                     |
| `tool-output-property-enum-value-removed`               | info     | mcp     | A value was removed from an enum. (output schema under tool-output-property)                                 |
| `tool-output-property-format-changed`                   | warning  | mcp     | The format annotation changed. (output schema under tool-output-property)                                    |
| `tool-output-property-items-added`                      | info     | mcp     | Array items are now constrained by a schema. (output schema under tool-output-property)                      |
| `tool-output-property-items-removed`                    | warning  | mcp     | Array items are no longer constrained by a schema. (output schema under tool-output-property)                |
| `tool-output-property-max-added`                        | info     | mcp     | A maximum constraint was added. (output schema under tool-output-property)                                   |
| `tool-output-property-max-decreased`                    | info     | mcp     | A maximum constraint decreased. (output schema under tool-output-property)                                   |
| `tool-output-property-max-increased`                    | warning  | mcp     | A maximum constraint increased. (output schema under tool-output-property)                                   |
| `tool-output-property-max-removed`                      | warning  | mcp     | A maximum constraint was removed. (output schema under tool-output-property)                                 |
| `tool-output-property-min-added`                        | info     | mcp     | A minimum constraint was added. (output schema under tool-output-property)                                   |
| `tool-output-property-min-decreased`                    | warning  | mcp     | A minimum constraint decreased. (output schema under tool-output-property)                                   |
| `tool-output-property-min-increased`                    | info     | mcp     | A minimum constraint increased. (output schema under tool-output-property)                                   |
| `tool-output-property-min-removed`                      | warning  | mcp     | A minimum constraint was removed. (output schema under tool-output-property)                                 |
| `tool-output-property-multiple-of-changed`              | warning  | mcp     | The multipleOf constraint changed. (output schema under tool-output-property)                                |
| `tool-output-property-nullable-added`                   | breaking | mcp     | The value may now be null. (output schema under tool-output-property)                                        |
| `tool-output-property-nullable-removed`                 | info     | mcp     | The value may no longer be null. (output schema under tool-output-property)                                  |
| `tool-output-property-one-of-branch-added`              | warning  | mcp     | An alternative was added to a oneOf or anyOf. (output schema under tool-output-property)                     |
| `tool-output-property-one-of-branch-removed`            | info     | mcp     | An alternative was removed from a oneOf or anyOf. (output schema under tool-output-property)                 |
| `tool-output-property-pattern-added`                    | info     | mcp     | A pattern constraint was added. (output schema under tool-output-property)                                   |
| `tool-output-property-pattern-changed`                  | warning  | mcp     | A pattern constraint changed. (output schema under tool-output-property)                                     |
| `tool-output-property-pattern-removed`                  | warning  | mcp     | A pattern constraint was removed. (output schema under tool-output-property)                                 |
| `tool-output-property-property-added`                   | info     | mcp     | An optional property was added, or a required one with a default. (output schema under tool-output-property) |
| `tool-output-property-property-became-optional`         | breaking | mcp     | A required property became optional. (output schema under tool-output-property)                              |
| `tool-output-property-property-became-required`         | info     | mcp     | An existing property became required. (output schema under tool-output-property)                             |
| `tool-output-property-property-removed`                 | breaking | mcp     | A property was removed. (output schema under tool-output-property)                                           |
| `tool-output-property-recursion-changed`                | warning  | mcp     | A schema became recursive or stopped being recursive. (output schema under tool-output-property)             |
| `tool-output-property-required-property-added`          | info     | mcp     | A required property without a default was added. (output schema under tool-output-property)                  |
| `tool-output-property-schema-added`                     | info     | mcp     | A schema now constrains a value that previously had none. (output schema under tool-output-property)         |
| `tool-output-property-schema-removed`                   | warning  | mcp     | A value that had a schema no longer has one; anything may appear. (output schema under tool-output-property) |
| `tool-output-property-type-changed`                     | breaking | mcp     | The type changed to something incompatible. (output schema under tool-output-property)                       |
| `tool-output-property-type-narrowed`                    | info     | mcp     | The set of allowed types shrank. (output schema under tool-output-property)                                  |
| `tool-output-property-type-widened`                     | breaking | mcp     | The set of allowed types grew. (output schema under tool-output-property)                                    |
| `tool-output-property-undeprecated`                     | info     | mcp     | The value is no longer marked deprecated. (output schema under tool-output-property)                         |
| `tool-output-property-unique-items-added`               | info     | mcp     | Array items must now be unique. (output schema under tool-output-property)                                   |
| `tool-output-property-unique-items-removed`             | warning  | mcp     | Array items no longer need to be unique. (output schema under tool-output-property)                          |
| `tool-output-schema-added`                              | info     | mcp     | A tool now declares an output schema.                                                                        |
| `tool-output-schema-removed`                            | warning  | mcp     | A tool no longer declares an output schema.                                                                  |
| `tool-removed`                                          | breaking | mcp     | A tool was removed.                                                                                          |
| `tool-title-changed`                                    | info     | mcp     | A tool's title changed.                                                                                      |

## Finding rules

26 findings reported by `verify`. Each finding carries a fix for either source of truth.

| ID                                   | Severity | Source  | Description                                                                                                |
| ------------------------------------ | -------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `deprecated-operation-in-use`        | info     | openapi | An observed request used an operation the spec marks deprecated.                                           |
| `pattern-not-checked`                | info     | openapi | A pattern in the spec was skipped because it was too long, failed to compile or looked unsafe to evaluate. |
| `request-accepted-but-invalid`       | warning  | openapi | The request violated the spec but the implementation accepted it with a 2xx.                               |
| `request-constraint-violation`       | info     | openapi | An observed request value violated a bound, length, pattern, format, multipleOf or uniqueness constraint.  |
| `request-enum-violation`             | info     | openapi | An observed request value was outside the enum or const the spec declares.                                 |
| `request-missing-body`               | info     | openapi | The observed request omitted a request body the spec marks required.                                       |
| `request-missing-required-parameter` | info     | openapi | The observed request omitted a parameter the spec marks required.                                          |
| `request-missing-required-property`  | info     | openapi | The observed request body omitted a property the spec marks required.                                      |
| `request-rejected-but-valid`         | breaking | openapi | The request conformed to the spec but the implementation rejected it with 400 or 422.                      |
| `request-schema-violation`           | info     | openapi | An observed request value did not satisfy a oneOf, anyOf, allOf or not constraint.                         |
| `request-type-mismatch`              | info     | openapi | An observed request value had a different type than the spec declares.                                     |
| `request-undocumented-media-type`    | info     | openapi | The observed request body used a media type the spec does not document.                                    |
| `request-undocumented-property`      | info     | openapi | The observed request contained a property the spec does not document or forbids.                           |
| `response-body-not-json`             | warning  | openapi | The spec documents a JSON response but the body could not be parsed as JSON.                               |
| `response-composition-violation`     | breaking | openapi | A response value did not satisfy a oneOf, anyOf, allOf or not constraint.                                  |
| `response-constraint-violation`      | warning  | openapi | A response value violated a bound, length, pattern, format, multipleOf or uniqueness constraint.           |
| `response-enum-violation`            | breaking | openapi | A response value was outside the enum or const the spec declares.                                          |
| `response-forbidden-property`        | breaking | openapi | The response contained a property the spec forbids (additionalProperties: false).                          |
| `response-header-missing`            | warning  | openapi | A response header the spec marks required was absent.                                                      |
| `response-missing-required-property` | breaking | openapi | A property the spec marks required was absent from the response.                                           |
| `response-null-not-allowed`          | breaking | openapi | A response value was null where the spec does not allow null.                                              |
| `response-type-mismatch`             | breaking | openapi | A response value had a different type than the spec declares.                                              |
| `response-undocumented-property`     | info     | openapi | The response contained a property the spec does not document.                                              |
| `undocumented-operation`             | warning  | openapi | An observed request matched no operation in the spec.                                                      |
| `undocumented-response-media-type`   | warning  | openapi | The implementation returned a media type the spec does not document for that status.                       |
| `undocumented-status`                | breaking | openapi | The implementation returned a status the spec does not document and there is no default response.          |
