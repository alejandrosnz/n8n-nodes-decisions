# Manual Workflow Testing Guide for n8n

This guide helps you manually test your new n8n node by creating and running test workflows in your n8n instance. Since this starter doesn't include automated workflow testing tools, the focus is on structured manual testing.

## 🚀 Manual Testing Approach

### Why Manual Testing?
- **Real Validation**: Test your node in a real n8n environment
- **Visual Debugging**: See exactly what happens at each step
- **UX Testing**: Verify the end-user experience
- **Integration Validation**: Ensure it works with other nodes

### Recommended Testing Flow
1. **Create simple test workflows** for each operation
2. **Configure test credentials** in n8n
3. **Execute and verify results** step by step
4. **Test edge cases** (errors, boundary data, etc.)
5. **Document found behaviors**

## 📋 Creating Test Workflows

### Basic Test Workflow Structure

```json
{
  "name": "Test - ExampleService Create Item",
  "nodes": [
    {
      "parameters": {},
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [240, 300],
      "id": "manual-trigger",
      "name": "Manual Trigger"
    },
    {
      "parameters": {
        "resource": "itemCrud",
        "operation": "createItem",
        "title": "Test Item",
        "body": "This is a test item",
        "userId": 1
      },
      "type": "n8n-nodes-starter.exampleService",
      "typeVersion": 1,
      "position": [460, 300],
      "id": "test-node",
      "name": "Create Test Item",
      "credentials": {
        "exampleServiceApi": {
          "id": "test-credential-id",
          "name": "Test API"
        }
      }
    }
  ],
  "connections": {
    "Manual Trigger": {
      "main": [
        [
          {
            "node": "Create Test Item",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "active": false,
  "settings": {
    "executionOrder": "v1"
  }
}
```

### How to Create a Test Workflow

1. **Install your node** in n8n (see docs/DEVELOPMENT.md)
2. **Go to the workflow editor** in n8n
3. **Add a Manual Trigger** as the starting point
4. **Add your node** and configure it
5. **Connect the nodes** appropriately
6. **Save the workflow** with a descriptive name

## 🧪 Test Workflows by Operation

### 1. Create Item - Basic Workflow

```json
{
  "name": "Test - Create Item",
  "nodes": [
    {
      "parameters": {},
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [100, 200],
      "id": "trigger",
      "name": "Start Test"
    },
    {
      "parameters": {
        "resource": "itemCrud",
        "operation": "createItem",
        "title": "Test Item {{ $now.format('YYYY-MM-DD HH:mm') }}",
        "body": "Created via n8n workflow test",
        "userId": 1
      },
      "type": "n8n-nodes-starter.exampleService",
      "typeVersion": 1,
      "position": [320, 200],
      "id": "create-node",
      "name": "Create Item",
      "credentials": {
        "exampleServiceApi": {
          "id": "test-cred",
          "name": "Test Credentials"
        }
      }
    },
    {
      "parameters": {
        "values": {
          "string": [
            {
              "name": "test_result",
              "value": "={{ $json }}"
            }
          ]
        },
        "options": {}
      },
      "type": "n8n-nodes-base.set",
      "typeVersion": 3,
      "position": [540, 200],
      "id": "result-logger",
      "name": "Log Result"
    }
  ],
  "connections": {
    "Start Test": {
      "main": [
        [
          {
            "node": "Create Item",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Create Item": {
      "main": [
        [
          {
            "node": "Log Result",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

### 2. List Items - With Pagination

```json
{
  "name": "Test - List Items with Pagination",
  "nodes": [
    {
      "parameters": {},
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [100, 200],
      "id": "trigger",
      "name": "Start Test"
    },
    {
      "parameters": {
        "resource": "itemCrud",
        "operation": "listItems",
        "returnAll": false,
        "limit": 3
      },
      "type": "n8n-nodes-starter.exampleService",
      "typeVersion": 1,
      "position": [320, 200],
      "id": "list-node",
      "name": "List 3 Items",
      "credentials": {
        "exampleServiceApi": {
          "id": "test-cred",
          "name": "Test Credentials"
        }
      }
    },
    {
      "parameters": {
        "values": {
          "string": [
            {
              "name": "item_count",
              "value": "={{ $json.length }}"
            },
            {
              "name": "first_item_title",
              "value": "={{ $json[0].title }}"
            }
          ]
        }
      },
      "type": "n8n-nodes-base.set",
      "typeVersion": 3,
      "position": [540, 200],
      "id": "analyze-results",
      "name": "Analyze Results"
    }
  ],
  "connections": {
    "Start Test": {
      "main": [
        [
          {
            "node": "List 3 Items",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "List 3 Items": {
      "main": [
        [
          {
            "node": "Analyze Results",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

### 3. Get Item - With Validation

```json
{
  "name": "Test - Get Item by ID",
  "nodes": [
    {
      "parameters": {},
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [100, 200],
      "id": "trigger",
      "name": "Start Test"
    },
    {
      "parameters": {
        "resource": "itemCrud",
        "operation": "getItem",
        "itemId": "1"
      },
      "type": "n8n-nodes-starter.exampleService",
      "typeVersion": 1,
      "position": [320, 200],
      "id": "get-node",
      "name": "Get Item ID 1",
      "credentials": {
        "exampleServiceApi": {
          "id": "test-cred",
          "name": "Test Credentials"
        }
      }
    },
    {
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{ $json.id }}",
              "value2": "1"
            }
          ]
        }
      },
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [540, 200],
      "id": "validate-id",
      "name": "Validate ID"
    },
    {
      "parameters": {
        "values": {
          "string": [
            {
              "name": "status",
              "value": "✅ Item retrieved correctly"
            }
          ]
        }
      },
      "type": "n8n-nodes-base.set",
      "typeVersion": 3,
      "position": [760, 100],
      "id": "success-log",
      "name": "Success"
    },
    {
      "parameters": {
        "values": {
          "string": [
            {
              "name": "status",
              "value": "❌ ID mismatch!"
            }
          ]
        }
      },
      "type": "n8n-nodes-base.set",
      "typeVersion": 3,
      "position": [760, 300],
      "id": "error-log",
      "name": "Error"
    }
  ],
  "connections": {
    "Start Test": {
      "main": [
        [
          {
            "node": "Get Item ID 1",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get Item ID 1": {
      "main": [
        [
          {
            "node": "Validate ID",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Validate ID": {
      "main": [
        [
          {
            "node": "Success",
            "type": "main",
            "index": 0
          }
        ]
      ],
      "main": [
        [
          {
            "node": "Error",
            "type": "main",
            "index": 1
          }
        ]
      ]
    }
  }
}
```

### 4. Update Item - Full Workflow

```json
{
  "name": "Test - Full CRUD Cycle",
  "nodes": [
    {
      "parameters": {},
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [100, 200],
      "id": "trigger",
      "name": "Start CRUD Test"
    },
    {
      "parameters": {
        "resource": "itemCrud",
        "operation": "createItem",
        "title": "CRUD Test Item",
        "body": "Initial content",
        "userId": 1
      },
      "type": "n8n-nodes-starter.exampleService",
      "typeVersion": 1,
      "position": [320, 200],
      "id": "create-node",
      "name": "Create Item",
      "credentials": {
        "exampleServiceApi": {
          "id": "test-cred",
          "name": "Test Credentials"
        }
      }
    },
    {
      "parameters": {
        "resource": "itemCrud",
        "operation": "updateItem",
        "itemId": "={{ $json.id }}",
        "title": "Updated CRUD Test Item",
        "body": "Updated content via n8n",
        "userId": 2
      },
      "type": "n8n-nodes-starter.exampleService",
      "typeVersion": 1,
      "position": [540, 200],
      "id": "update-node",
      "name": "Update Item",
      "credentials": {
        "exampleServiceApi": {
          "id": "test-cred",
          "name": "Test Credentials"
        }
      }
    },
    {
      "parameters": {
        "resource": "itemCrud",
        "operation": "getItem",
        "itemId": "={{ $json.id }}"
      },
      "type": "n8n-nodes-starter.exampleService",
      "typeVersion": 1,
      "position": [760, 200],
      "id": "verify-node",
      "name": "Verify Update",
      "credentials": {
        "exampleServiceApi": {
          "id": "test-cred",
          "name": "Test Credentials"
        }
      }
    },
    {
      "parameters": {
        "resource": "itemCrud",
        "operation": "deleteItem",
        "itemId": "={{ $json.id }}"
      },
      "type": "n8n-nodes-starter.exampleService",
      "typeVersion": 1,
      "position": [980, 200],
      "id": "delete-node",
      "name": "Delete Item",
      "credentials": {
        "exampleServiceApi": {
          "id": "test-cred",
          "name": "Test Credentials"
        }
      }
    }
  ],
  "connections": {
    "Start CRUD Test": {
      "main": [
        [
          {
            "node": "Create Item",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Create Item": {
      "main": [
        [
          {
            "node": "Update Item",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Update Item": {
      "main": [
        [
          {
            "node": "Verify Update",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Verify Update": {
      "main": [
        [
          {
            "node": "Delete Item",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

## 🛠️ Best Practices for Manual Testing

### Test Credentials Setup

1. **Use test APIs**: JSONPlaceholder, MockAPI, etc.
2. **Configure secure credentials**: Don't use production
3. **Document your credentials**: Keep notes on which APIs you use

```json
// Example test credential
{
  "name": "Test API",
  "type": "exampleServiceApi",
  "data": {
    "baseUrl": "https://jsonplaceholder.typicode.com"
  }
}
```

### Testing Strategy

#### 1. Testing by Operation
- **Create a separate workflow** for each operation
- **Test with valid data** first
- **Then test edge cases**: non-existent IDs, empty data, etc.

#### 2. Error Testing
```json
{
  "name": "Test - Error Handling",
  "nodes": [
    {
      "parameters": {
        "resource": "itemCrud",
        "operation": "getItem",
        "itemId": "999999"
      },
      "type": "n8n-nodes-starter.exampleService",
      "typeVersion": 1,
      "name": "Get Non-existent Item"
    }
  ]
}
```

#### 3. Validation Testing
- Test empty required fields
- Test incorrect data types
- Test data limits

#### 4. Performance Testing
- Test with large amounts of data
- Verify response times
- Monitor memory usage

### Debugging in n8n

#### Using the Execution Panel
1. **Execute the workflow** step by step
2. **Review the output** of each node
3. **Look for errors** in the browser console
4. **Verify credentials** and connections

#### Useful Logs
```json
{
  "parameters": {
    "values": {
      "string": [
        {
          "name": "debug_info",
          "value": "={{ JSON.stringify($json, null, 2) }}"
        },
        {
          "name": "execution_time",
          "value": "={{ $now }}"
        }
      ]
    }
  },
  "type": "n8n-nodes-base.set",
  "name": "Debug Logger"
}
```

### Essential Testing Cases

#### ✅ Success Cases
- Basic operation works
- Data transforms correctly
- Node connections work
- Credentials apply correctly

#### ❌ Error Cases
- API returns 404 error
- Invalid credentials
- Required fields missing
- Connection timeouts

#### 🔄 Edge Cases
- Very large data
- Special characters
- Negative or zero IDs
- Slow connections

## 📋 Testing Checklist

### Before Executing
- [ ] Node installed correctly
- [ ] Credentials configured
- [ ] Workflow saved
- [ ] Connections verified

### During Execution
- [ ] Each node executes without errors
- [ ] Data flows correctly
- [ ] Results are as expected
- [ ] Logs show useful information

### After Executing
- [ ] Results documented
- [ ] Found issues reported
- [ ] Improvements identified
- [ ] Workflow saved as reference

## 🎯 Tips for Effective Test Workflows

### Descriptive Names
- ✅ "Test - Create Item Success"
- ✅ "Test - List Items Pagination"
- ❌ "Test 1"
- ❌ "My Workflow"

### Inline Documentation
```json
{
  "name": "Test - Create Item with Validation",
  "nodes": [
    {
      "parameters": {
        "values": {
          "string": [
            {
              "name": "test_description",
              "value": "Testing item creation with empty title (should fail)"
            }
          ]
        }
      },
      "type": "n8n-nodes-base.set",
      "name": "Test Description"
    }
  ]
}
```

### Data Reuse
```json
{
  "parameters": {
    "resource": "itemCrud",
    "operation": "createItem",
    "title": "Test Item {{ $now.format('x') }}",
    "body": "Created at {{ $now.toISOString() }}"
  }
}
```

### Automated Manual Testing
Use the "Schedule Trigger" to execute tests automatically:

```json
{
  "parameters": {
    "rule": {
      "interval": [
        {
          "field": "hours",
          "amount": 1
        }
      ]
    }
  },
  "type": "n8n-nodes-base.scheduleTrigger",
  "name": "Hourly Health Check"
}
```

## 🚨 Common Troubleshooting

### "Node not found"
- Verify the node is installed
- Restart n8n
- Check installation logs

### "Credentials invalid"
- Verify credential configuration
- Try public APIs first
- Review data format

### "Workflow doesn't execute"
- Verify node connections
- Ensure trigger is active
- Review required parameters

### "Unexpected output format"
- Compare with API documentation
- Verify data transformation
- Review node configuration

## 🔧 Local Development Setup

Another option for users is to run n8n locally with `npm run dev`, and your new node will be available, compiled from your local codebase (without uploading to npm).

### Running n8n Locally

1. **Start the development server**:
   ```bash
   npm run dev
   ```

2. **Access n8n** at `http://localhost:5678`

3. **Your node will be automatically available** in the node palette under "Examples" or your custom category

4. **Changes are hot-reloaded** - modify your code and see changes immediately without restarting

### Benefits of Local Development
- **Instant feedback**: See changes immediately
- **No publishing required**: Test locally before publishing
- **Full debugging**: Use breakpoints and console logs
- **Version control**: Keep your node in sync with your codebase

### Local vs Published Node
- **Local**: `npm run dev` - for development and testing
- **Published**: `npm install your-package` - for production use

This guide allows you to thoroughly validate your node in a real n8n environment, ensuring it works correctly before publishing.

## 🧪 Workflows de Prueba por Operación

### 1. Create Item - Workflow Básico

```json
{
  "name": "Test - Create Item",
  "nodes": [
    {
      "parameters": {},
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [100, 200],
      "id": "trigger",
      "name": "Start Test"
    },
    {
      "parameters": {
        "resource": "itemCrud",
        "operation": "createItem",
        "title": "Test Item {{ $now.format('YYYY-MM-DD HH:mm') }}",
        "body": "Created via n8n workflow test",
        "userId": 1
      },
      "type": "n8n-nodes-starter.exampleService",
      "typeVersion": 1,
      "position": [320, 200],
      "id": "create-node",
      "name": "Create Item",
      "credentials": {
        "exampleServiceApi": {
          "id": "test-cred",
          "name": "Test Credentials"
        }
      }
    },
    {
      "parameters": {
        "values": {
          "string": [
            {
              "name": "test_result",
              "value": "={{ $json }}"
            }
          ]
        },
        "options": {}
      },
      "type": "n8n-nodes-base.set",
      "typeVersion": 3,
      "position": [540, 200],
      "id": "result-logger",
      "name": "Log Result"
    }
  ],
  "connections": {
    "Start Test": {
      "main": [
        [
          {
            "node": "Create Item",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Create Item": {
      "main": [
        [
          {
            "node": "Log Result",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

### 2. List Items - Con Paginación

```json
{
  "name": "Test - List Items with Pagination",
  "nodes": [
    {
      "parameters": {},
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [100, 200],
      "id": "trigger",
      "name": "Start Test"
    },
    {
      "parameters": {
        "resource": "itemCrud",
        "operation": "listItems",
        "returnAll": false,
        "limit": 3
      },
      "type": "n8n-nodes-starter.exampleService",
      "typeVersion": 1,
      "position": [320, 200],
      "id": "list-node",
      "name": "List 3 Items",
      "credentials": {
        "exampleServiceApi": {
          "id": "test-cred",
          "name": "Test Credentials"
        }
      }
    },
    {
      "parameters": {
        "values": {
          "string": [
            {
              "name": "item_count",
              "value": "={{ $json.length }}"
            },
            {
              "name": "first_item_title",
              "value": "={{ $json[0].title }}"
            }
          ]
        }
      },
      "type": "n8n-nodes-base.set",
      "typeVersion": 3,
      "position": [540, 200],
      "id": "analyze-results",
      "name": "Analyze Results"
    }
  ],
  "connections": {
    "Start Test": {
      "main": [
        [
          {
            "node": "List 3 Items",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "List 3 Items": {
      "main": [
        [
          {
            "node": "Analyze Results",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

### 3. Get Item - Con Validación

```json
{
  "name": "Test - Get Item by ID",
  "nodes": [
    {
      "parameters": {},
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [100, 200],
      "id": "trigger",
      "name": "Start Test"
    },
    {
      "parameters": {
        "resource": "itemCrud",
        "operation": "getItem",
        "itemId": "1"
      },
      "type": "n8n-nodes-starter.exampleService",
      "typeVersion": 1,
      "position": [320, 200],
      "id": "get-node",
      "name": "Get Item ID 1",
      "credentials": {
        "exampleServiceApi": {
          "id": "test-cred",
          "name": "Test Credentials"
        }
      }
    },
    {
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{ $json.id }}",
              "value2": "1"
            }
          ]
        }
      },
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [540, 200],
      "id": "validate-id",
      "name": "Validate ID"
    },
    {
      "parameters": {
        "values": {
          "string": [
            {
              "name": "status",
              "value": "✅ Item retrieved correctly"
            }
          ]
        }
      },
      "type": "n8n-nodes-base.set",
      "typeVersion": 3,
      "position": [760, 100],
      "id": "success-log",
      "name": "Success"
    },
    {
      "parameters": {
        "values": {
          "string": [
            {
              "name": "status",
              "value": "❌ ID mismatch!"
            }
          ]
        }
      },
      "type": "n8n-nodes-base.set",
      "typeVersion": 3,
      "position": [760, 300],
      "id": "error-log",
      "name": "Error"
    }
  ],
  "connections": {
    "Start Test": {
      "main": [
        [
          {
            "node": "Get Item ID 1",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get Item ID 1": {
      "main": [
        [
          {
            "node": "Validate ID",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Validate ID": {
      "main": [
        [
          {
            "node": "Success",
            "type": "main",
            "index": 0
          }
        ]
      ],
      "main": [
        [
          {
            "node": "Error",
            "type": "main",
            "index": 1
          }
        ]
      ]
    }
  }
}
```

### 4. Update Item - Workflow Completo

```json
{
  "name": "Test - Full CRUD Cycle",
  "nodes": [
    {
      "parameters": {},
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [100, 200],
      "id": "trigger",
      "name": "Start CRUD Test"
    },
    {
      "parameters": {
        "resource": "itemCrud",
        "operation": "createItem",
        "title": "CRUD Test Item",
        "body": "Initial content",
        "userId": 1
      },
      "type": "n8n-nodes-starter.exampleService",
      "typeVersion": 1,
      "position": [320, 200],
      "id": "create-node",
      "name": "Create Item",
      "credentials": {
        "exampleServiceApi": {
          "id": "test-cred",
          "name": "Test Credentials"
        }
      }
    },
    {
      "parameters": {
        "resource": "itemCrud",
        "operation": "updateItem",
        "itemId": "={{ $json.id }}",
        "title": "Updated CRUD Test Item",
        "body": "Updated content via n8n",
        "userId": 2
      },
      "type": "n8n-nodes-starter.exampleService",
      "typeVersion": 1,
      "position": [540, 200],
      "id": "update-node",
      "name": "Update Item",
      "credentials": {
        "exampleServiceApi": {
          "id": "test-cred",
          "name": "Test Credentials"
        }
      }
    },
    {
      "parameters": {
        "resource": "itemCrud",
        "operation": "getItem",
        "itemId": "={{ $json.id }}"
      },
      "type": "n8n-nodes-starter.exampleService",
      "typeVersion": 1,
      "position": [760, 200],
      "id": "verify-node",
      "name": "Verify Update",
      "credentials": {
        "exampleServiceApi": {
          "id": "test-cred",
          "name": "Test Credentials"
        }
      }
    },
    {
      "parameters": {
        "resource": "itemCrud",
        "operation": "deleteItem",
        "itemId": "={{ $json.id }}"
      },
      "type": "n8n-nodes-starter.exampleService",
      "typeVersion": 1,
      "position": [980, 200],
      "id": "delete-node",
      "name": "Delete Item",
      "credentials": {
        "exampleServiceApi": {
          "id": "test-cred",
          "name": "Test Credentials"
        }
      }
    }
  ],
  "connections": {
    "Start CRUD Test": {
      "main": [
        [
          {
            "node": "Create Item",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Create Item": {
      "main": [
        [
          {
            "node": "Update Item",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Update Item": {
      "main": [
        [
          {
            "node": "Verify Update",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Verify Update": {
      "main": [
        [
          {
            "node": "Delete Item",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

## 🛠️ Buenas Prácticas para Testing Manual

### Configuración de Credenciales de Prueba

1. **Usa APIs de prueba**: JSONPlaceholder, MockAPI, etc.
2. **Configura credenciales seguras**: No uses producción
3. **Documenta tus credenciales**: Guarda en notas qué APIs usas

```json
// Ejemplo de credencial de prueba
{
  "name": "Test API",
  "type": "exampleServiceApi",
  "data": {
    "baseUrl": "https://jsonplaceholder.typicode.com"
  }
}
```

### Estrategia de Testing

#### 1. Testing por Operación
- **Crea un workflow separado** para cada operación
- **Prueba con datos válidos** primero
- **Luego prueba casos edge**: IDs inexistentes, datos vacíos, etc.

#### 2. Testing de Errores
```json
{
  "name": "Test - Error Handling",
  "nodes": [
    {
      "parameters": {
        "resource": "itemCrud",
        "operation": "getItem",
        "itemId": "999999"
      },
      "type": "n8n-nodes-starter.exampleService",
      "typeVersion": 1,
      "name": "Get Non-existent Item"
    }
  ]
}
```

#### 3. Testing de Validación
- Prueba campos requeridos vacíos
- Prueba tipos de datos incorrectos
- Prueba límites de datos

#### 4. Testing de Rendimiento
- Prueba con muchos datos
- Verifica tiempos de respuesta
- Monitorea uso de memoria

### Debugging en n8n

#### Usando el Panel de Ejecución
1. **Ejecuta el workflow** paso a paso
2. **Revisa la salida** de cada nodo
3. **Busca errores** en la consola del navegador
4. **Verifica credenciales** y conexiones

#### Logs Útiles
```json
{
  "parameters": {
    "values": {
      "string": [
        {
          "name": "debug_info",
          "value": "={{ JSON.stringify($json, null, 2) }}"
        },
        {
          "name": "execution_time",
          "value": "={{ $now }}"
        }
      ]
    }
  },
  "type": "n8n-nodes-base.set",
  "name": "Debug Logger"
}
```

### Casos de Testing Esenciales

#### ✅ Casos de Éxito
- Operación básica funciona
- Datos se transforman correctamente
- Conexiones entre nodos funcionan
- Credenciales se aplican correctamente

#### ❌ Casos de Error
- API devuelve error 404
- Credenciales inválidas
- Campos requeridos faltan
- Timeouts de conexión

#### 🔄 Casos Edge
- Datos muy grandes
- Caracteres especiales
- IDs negativos o cero
- Conexiones lentas

## 📋 Checklist de Testing

### Antes de Ejecutar
- [ ] Nodo instalado correctamente
- [ ] Credenciales configuradas
- [ ] Workflow guardado
- [ ] Conexiones verificadas

### Durante la Ejecución
- [ ] Cada nodo se ejecuta sin errores
- [ ] Datos fluyen correctamente
- [ ] Resultados son los esperados
- [ ] Logs muestran información útil

### Después de Ejecutar
- [ ] Resultados documentados
- [ ] Issues encontrados reportados
- [ ] Mejoras identificadas
- [ ] Workflow guardado como referencia

## 🎯 Consejos para Workflows de Prueba Efectivos

### Nombres Descriptivos
- ✅ "Test - Create Item Success"
- ✅ "Test - List Items Pagination"
- ❌ "Test 1"
- ❌ "My Workflow"

### Documentación Inline
```json
{
  "name": "Test - Create Item with Validation",
  "nodes": [
    {
      "parameters": {
        "values": {
          "string": [
            {
              "name": "test_description",
              "value": "Testing item creation with empty title (should fail)"
            }
          ]
        }
      },
      "type": "n8n-nodes-base.set",
      "name": "Test Description"
    }
  ]
}
```

### Data Reuse
```json
{
  "parameters": {
    "resource": "itemCrud",
    "operation": "createItem",
    "title": "Test Item {{ $now.format('x') }}",
    "body": "Created at {{ $now.toISOString() }}"
  }
}
```

### Automated Manual Testing
Use the "Schedule Trigger" to execute tests automatically:

```json
{
  "parameters": {
    "rule": {
      "interval": [
        {
          "field": "hours",
          "amount": 1
        }
      ]
    }
  },
  "type": "n8n-nodes-base.scheduleTrigger",
  "name": "Hourly Health Check"
}
```

## 🚨 Common Troubleshooting

### "Node not found"
- Verify the node is installed
- Restart n8n
- Check installation logs

### "Credentials invalid"
- Verify credential configuration
- Try public APIs first
- Review data format

### "Workflow doesn't execute"
- Verify node connections
- Ensure trigger is active
- Review required parameters

### "Unexpected output format"
- Compare with API documentation
- Verify data transformation
- Review node configuration

## 🔧 Local Development Setup

Another option for users is to run n8n locally with `npm run dev`, and your new node will be available, compiled from your local codebase (without uploading to npm).

### Running n8n Locally

1. **Start the development server**:
   ```bash
   npm run dev
   ```

2. **Access n8n** at `http://localhost:5678`

3. **Your node will be automatically available** in the node palette under "Examples" or your custom category

4. **Changes are hot-reloaded** - modify your code and see changes immediately without restarting

### Benefits of Local Development
- **Instant feedback**: See changes immediately
- **No publishing required**: Test locally before publishing
- **Full debugging**: Use breakpoints and console logs
- **Version control**: Keep your node in sync with your codebase

### Local vs Published Node
- **Local**: `npm run dev` - for development and testing
- **Published**: `npm install your-package` - for production use

This guide allows you to thoroughly validate your node in a real n8n environment, ensuring it works correctly before publishing.
