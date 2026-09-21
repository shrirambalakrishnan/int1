'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');

function buildMcpServer(int1Url) {
  const server = new McpServer({ name: 'int1', version: '0.0.1' });

  server.registerTool(
    'list_integrations',
    {
      title: 'List Integrations',
      description: 'List integrations configured in int1',
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const res = await fetch(`${int1Url}/integrations`);
        const text = await res.text();

        return { isError: !res.ok, content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: err.message }],
        };
      }
    }
  );

  return server;
}

module.exports = { buildMcpServer };
