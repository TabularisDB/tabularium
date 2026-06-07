export const mjml = `<mjml>
  <mj-body background-color="#f8fafc">
    <mj-section background-color="#ffffff" padding="32px">
      <mj-column>
        <mj-text font-size="22px" font-weight="600">{{pluginName}} is approved.</mj-text>
        <mj-text>Your plugin is now public on the Tabularium registry.</mj-text>
        <mj-button href="{{baseUrl}}/plugins/{{pluginSlug}}" background-color="#16a34a" color="#ffffff">View on registry</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`
