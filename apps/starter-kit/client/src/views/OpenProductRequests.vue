<template>
  <div class="text-section">
    <h1 class="text-section-title">
      Open Product Request
    </h1>
    <p>
      Please test the resources below for ModelBank:
    </p>
    <button @click="getProducts" class="thirdButton">
      Get Products
    </button>
  </div>
  <pre v-if="displayedJson" class="code-section">
    <img class="codeCopyIcon" @click="copy" src="../assets/icons/copy.svg" alt="copy" />
    {{ displayedJson }}
  </pre>
</template>


<script>
import api from '../api';

export default {
  data() {
    return {
      displayedJson: undefined
    }
  },
  created() {
    if (!this.bank) {
      this.$router.push({ name: 'consent-setup' })
    }
  },
  computed: {
    bank() {
      return this.$route.query.bank
    },
  },
  methods: {
    async getProducts() {

      try {
        // Get access token
        const config = {
          method: 'post',
          url: `/token/client-credentials`,
          data: { scope: 'openid products' }
        };

        const response = await api.request(config)

        if (!response.data || !response.data.access_token) {
          throw new Error('No access token returned');
        }

        const accessToken = response.data.access_token;

        // Call the products API with access token
        const productConfig = {
          method: 'get',
          url: `/open-finance/product/v1.2/products`,
          headers: {
            Authorization: `Bearer ${accessToken}`,
          }
        };

        const productsResponse = await api.request(productConfig)
        this.displayedJson = productsResponse.data;

      } catch (error) {
        throw new Error(`Request failed: ${error.message}`);
      }
    }
  }
}
</script>