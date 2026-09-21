'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');

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

  server.registerTool(
    'list_boards',
    {
      title: 'List Boards',
      description:
        'List all boards in int1. Each board has id and an integrationId showing the integration provider it syncs to',
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const res = await fetch(`${int1Url}/boards`);
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

  server.registerTool(
    'list_tasks',
    {
      title: 'List tasks',
      description: 'List Tasks in one board. Get boardId from list_boards',
      inputSchema: { boardId: z.number().int().describe('int1 board id') },
      annotations: { readOnlyHint: true },
    },
    async ({ boardId }) => {
      try {
        const res = await fetch(`${int1Url}/boards/${boardId}/tasks`);
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
